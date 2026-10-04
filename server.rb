# frozen_string_literal: true
# ==============================================================================
# MediPulse - Full-Stack Smart Medicine Reminder & Tracker Backend in Ruby
# Supports Ruby 2.x and 3.x.
# Automatically uses WEBrick if installed, with seamless fallback to pure Ruby TCPServer.
# Zero external gem runtime dependencies required.
# ==============================================================================

require 'json'
require 'time'
require 'date'
require 'socket'
require 'fileutils'
require 'uri'

PORT = 8000
DATA_FILE = File.expand_path('medicine_data.json', __dir__)
STATIC_DIR = File.expand_path(__dir__)

# --- DEFAULT SEED DATA ---
DEFAULT_DATA = {
  'medications' => [
    {
      'id' => 'med_1',
      'name' => 'Metformin',
      'dosage' => '500 mg',
      'form' => 'Tablet',
      'color' => 'indigo',
      'foodCondition' => 'With Food',
      'times' => ['08:30', '19:30'],
      'stock' => 28,
      'lowThreshold' => 10,
      'notes' => 'Take immediately with main meals to reduce GI sensitivity.'
    },
    {
      'id' => 'med_2',
      'name' => 'Lisinopril',
      'dosage' => '10 mg',
      'form' => 'Tablet',
      'color' => 'emerald',
      'foodCondition' => 'Before Food',
      'times' => ['09:00'],
      'stock' => 14,
      'lowThreshold' => 7,
      'notes' => 'Blood pressure management. Take consistently every morning.'
    },
    {
      'id' => 'med_3',
      'name' => 'Vitamin D3',
      'dosage' => '2000 IU',
      'form' => 'Capsule',
      'color' => 'amber',
      'foodCondition' => 'With Food',
      'times' => ['13:00'],
      'stock' => 3,
      'lowThreshold' => 5,
      'notes' => 'Fat-soluble vitamin. Best absorbed with healthy dietary fats.'
    },
    {
      'id' => 'med_4',
      'name' => 'Atorvastatin',
      'dosage' => '20 mg',
      'form' => 'Tablet',
      'color' => 'purple',
      'foodCondition' => 'After Food',
      'times' => ['21:30'],
      'stock' => 22,
      'lowThreshold' => 7,
      'notes' => 'Take at bedtime. Avoid drinking grapefruit juice.'
    }
  ],
  'logs' => [
    {
      'id' => 'seed_1',
      'medId' => 'med_1',
      'medName' => 'Metformin',
      'dosage' => '500 mg',
      'scheduledTime' => '08:30',
      'date' => (Date.today - 1).strftime('%Y-%m-%d'),
      'timestamp' => "#{(Date.today - 1).strftime('%Y-%m-%d')} 08:34:00",
      'status' => 'taken',
      'notes' => 'Taken with breakfast'
    },
    {
      'id' => 'seed_2',
      'medId' => 'med_2',
      'medName' => 'Lisinopril',
      'dosage' => '10 mg',
      'scheduledTime' => '09:00',
      'date' => (Date.today - 1).strftime('%Y-%m-%d'),
      'timestamp' => "#{(Date.today - 1).strftime('%Y-%m-%d')} 09:02:11",
      'status' => 'taken',
      'notes' => ''
    }
  ],
  'settings' => {
    'soundTone' => 'chime',
    'snoozeMinutes' => 10,
    'caregiverContact' => '+1 (555) 234-8790 (Dr. Evelyn Reed)'
  }
}.freeze

# --- DATABASE PERSISTENCE HELPERS ---
class MedicineDB
  @mutex = Mutex.new

  def self.load_data
    @mutex.synchronize do
      unless File.exist?(DATA_FILE)
        save_raw(DEFAULT_DATA)
        return JSON.parse(JSON.generate(DEFAULT_DATA))
      end
      begin
        JSON.parse(File.read(DATA_FILE))
      rescue StandardError => e
        warn "Error reading #{DATA_FILE}: #{e.message}. Using default data."
        JSON.parse(JSON.generate(DEFAULT_DATA))
      end
    end
  end

  def self.save_data(data)
    @mutex.synchronize do
      save_raw(data)
    end
  end

  def self.save_raw(data)
    File.write(DATA_FILE, JSON.pretty_generate(data))
  end
end

# --- DRUG SAFETY & AI INTERACTION SCANNER ---
class DrugSafetyEngine
  INTERACTION_RULES = [
    {
      name: 'hyperkalemia',
      severity: 'high',
      title: 'Hyperkalemia Hazard (ACE Inhibitors / ARBs + Potassium)',
      desc: 'Co-administering ACE inhibitors or ARBs with potassium supplements or potassium-sparing diuretics may dangerously elevate serum potassium, risking cardiac arrhythmia.',
      trigger: ->(names) {
        ace_or_arb = names.any? { |n| n.match?(/\b(lisinopril|enalapril|ramipril|losartan|valsartan|candesartan)\b/) }
        potassium = names.any? { |n| n.match?(/\b(potassium|spironolactone|triamterene|amiloride|eplerenone)\b/) }
        ace_or_arb && potassium
      }
    },
    {
      name: 'bleeding_risk',
      severity: 'high',
      title: 'Major Hemorrhage Risk (Blood Thinners + NSAIDs)',
      desc: 'Concomitant use of anticoagulants/antiplatelets and NSAIDs significantly elevates gastrointestinal bleeding and ulceration hazards.',
      trigger: ->(names) {
        anticoag = names.any? { |n| n.match?(/\b(warfarin|coumadin|apixaban|eliquis|rivaroxaban|xarelto|dabigatran|clopidogrel|plavix|aspirin)\b/) }
        nsaid = names.any? { |n| n.match?(/\b(ibuprofen|advil|motrin|naproxen|aleve|meloxicam|celecoxib|diclofenac|ketorolac)\b/) }
        anticoag && nsaid
      }
    },
    {
      name: 'serotonin_syndrome',
      severity: 'high',
      title: 'Serotonin Toxicity Risk (SSRIs/SNRIs + Serotonergic Agents)',
      desc: 'Concurrent serotonergic agents can trigger serotonin syndrome (hyperthermia, neuromuscular clonus, and autonomic dysfunction).',
      trigger: ->(names) {
        antidepressants = names.any? { |n| n.match?(/\b(sertraline|zoloft|fluoxetine|prozac|escitalopram|lexapro|citalopram|venlafaxine|duloxetine|cymbalta)\b/) }
        serotonin_agents = names.any? { |n| n.match?(/\b(tramadol|st\.?\s*john|dextromethorphan|linezolid|triptan|sumatriptan)\b/) }
        antidepressants && serotonin_agents
      }
    },
    {
      name: 'cns_depression',
      severity: 'high',
      title: 'Profound CNS & Respiratory Depression (Opioids + Sedatives)',
      desc: 'Combining opioids with benzodiazepines or sleep aids causes additive CNS depression and life-threatening respiratory sedation.',
      trigger: ->(names) {
        opioids = names.any? { |n| n.match?(/\b(oxycodone|hydrocodone|morphine|codeine|tramadol|fentanyl)\b/) }
        sedatives = names.any? { |n| n.match?(/\b(alprazolam|xanax|lorazepam|ativan|diazepam|valium|clonazepam|klonopin|zolpidem|ambien)\b/) }
        opioids && sedatives
      }
    },
    {
      name: 'metformin_alcohol',
      severity: 'medium',
      title: 'Metformin & Alcohol Contraindication',
      desc: 'Alcohol potentiation during metformin therapy substantially increases the risk of lactic acidosis and acute hypoglycemia.',
      trigger: ->(names) {
        metformin = names.any? { |n| n.include?('metformin') }
        alcohol = names.any? { |n| n.match?(/\b(alcohol|ethanol|wine|beer)\b/) }
        metformin && alcohol
      }
    },
    {
      name: 'levothyroxine_absorption',
      severity: 'medium',
      title: 'Thyroid Hormone Chelation (Levothyroxine + Polyvalent Minerals)',
      desc: 'Calcium, iron, magnesium, and antacids chelate levothyroxine in the GI tract. Administer at least 4 hours apart.',
      trigger: ->(names) {
        thyroid = names.any? { |n| n.match?(/\b(levothyroxine|synthroid|euthyrox)\b/) }
        minerals = names.any? { |n| n.match?(/\b(calcium|iron|ferrous|magnesium|antacid|tums)\b/) }
        thyroid && minerals
      }
    },
    {
      name: 'ace_nsaid_renal',
      severity: 'medium',
      title: 'Renal Perfusion Impairment (ACEi/ARBs + NSAIDs)',
      desc: 'NSAIDs attenuate the antihypertensive benefits of ACE inhibitors/ARBs and may precipitate acute kidney injury, especially in dehydration.',
      trigger: ->(names) {
        ace_arb = names.any? { |n| n.match?(/\b(lisinopril|losartan|enalapril|valsartan)\b/) }
        nsaid = names.any? { |n| n.match?(/\b(ibuprofen|advil|naproxen|aleve)\b/) }
        ace_arb && nsaid
      }
    },
    {
      name: 'statin_grapefruit',
      severity: 'info',
      title: 'Statin Metabolism & Grapefruit Advisory',
      desc: 'Grapefruit inhibits intestinal CYP3A4 metabolism, drastically elevating statin plasma levels and myopathy risk.',
      trigger: ->(names) {
        names.any? { |n| n.match?(/\b(atorvastatin|lipitor|simvastatin|zocor|lovastatin)\b/) }
      }
    }
  ].freeze

  def self.audit(medications)
    names = (medications || []).map { |m| m['name'].to_s.strip.downcase }
    conflicts = []

    # 1. Standard Clinical Rules
    INTERACTION_RULES.each do |rule|
      if rule[:trigger].call(names)
        conflicts << {
          severity: rule[:severity],
          title: rule[:title],
          desc: rule[:desc]
        }
      end
    end

    # 2. Duplicate Therapy Detection
    seen = {}
    names.each do |nm|
      base_name = nm.split.first
      if seen[base_name]
        conflicts << {
          severity: 'medium',
          title: "Potential Duplicate Therapy: #{base_name.capitalize}",
          desc: "You have multiple medications registered containing '#{base_name.capitalize}'. Please verify doses with your pharmacist to prevent accidental overdosing."
        }
      else
        seen[base_name] = true
      end
    end

    {
      checkedCount: medications.length,
      conflicts: conflicts
    }
  end
end

# --- ANALYTICS ENGINE ---
class AdherenceAnalytics
  def self.compute(medications, logs)
    total_logs = logs.length
    taken_logs = logs.count { |l| l['status'] == 'taken' }
    skipped_logs = logs.count { |l| l['status'] == 'skipped' }
    snoozed_logs = logs.count { |l| l['status'] == 'snoozed' }

    adherence_rate = total_logs.positive? ? ((taken_logs.to_f / total_logs) * 100).round : 100

    low_stock = medications.count do |m|
      stock = m['stock'].to_i
      threshold = (m['lowThreshold'] || 5).to_i
      stock <= threshold
    end

    # Streak calculation
    taken_dates = logs.select { |l| l['status'] == 'taken' }.map { |l| l['date'] }.compact.uniq.sort.reverse
    streak_days = 0
    curr = Date.today

    # If taken today, start from today, else check if taken yesterday
    start_date = taken_dates.include?(curr.strftime('%Y-%m-%d')) ? curr : (curr - 1)
    loop do
      date_str = start_date.strftime('%Y-%m-%d')
      if taken_dates.include?(date_str)
        streak_days += 1
        start_date -= 1
      else
        break
      end
    end

    {
      adherenceRate: adherence_rate,
      totalLogged: total_logs,
      totalTaken: taken_logs,
      totalSkipped: skipped_logs,
      totalSnoozed: snoozed_logs,
      lowStockCount: low_stock,
      streakDays: streak_days,
      medicationsCount: medications.length
    }
  end
end

# --- CORE API ROUTER & CONTROLLER ---
module MediPulseRouter
  MIME_TYPES = {
    '.html' => 'text/html; charset=utf-8',
    '.css'  => 'text/css; charset=utf-8',
    '.js'   => 'text/javascript; charset=utf-8',
    '.json' => 'application/json; charset=utf-8',
    '.png'  => 'image/png',
    '.jpg'  => 'image/jpeg',
    '.svg'  => 'image/svg+xml',
    '.ico'  => 'image/x-icon'
  }.freeze

  def self.handle(method, path, body_str)
    # Handle CORS Preflight
    return response(204, '') if method == 'OPTIONS'

    # Normalize path if full URI or query string is present
    path = path.to_s.split('?').first
    if path.include?('://')
      begin
        path = URI.parse(path).path
      rescue StandardError
        # fallback
      end
    end

    data = MedicineDB.load_data
    parsed_body = begin
      body_str && !body_str.empty? ? JSON.parse(body_str) : {}
    rescue StandardError
      {}
    end

    # --- 1. Status Check ---
    if method == 'GET' && path == '/api/status'
      return json_response(200, {
        status: 'online',
        engine: "Ruby #{RUBY_VERSION}",
        server: defined?(WEBrick) ? 'WEBrick' : 'Pure TCPServer',
        persistence: 'JSON File Store',
        timestamp: Time.now.iso8601
      })
    end

    # --- 2. Analytics & Adherence Summary ---
    if method == 'GET' && path == '/api/analytics'
      summary = AdherenceAnalytics.compute(data['medications'] || [], data['logs'] || [])
      return json_response(200, summary)
    end

    # --- 3. Medications Endpoints ---
    if method == 'GET' && path == '/api/medications'
      return json_response(200, data['medications'] || [])
    end

    if method == 'POST' && path == '/api/medications'
      item = parsed_body
      item['id'] ||= "med_#{Time.now.to_i}_#{rand(1000)}"
      data['medications'] ||= []
      data['medications'] << item
      MedicineDB.save_data(data)
      return json_response(201, { success: true, medication: item })
    end

    # Refill: /api/medications/:id/refill
    if method == 'POST' && path =~ %r{\A/api/medications/([^/]+)/refill\z}
      med_id = Regexp.last_match(1)
      amount = (parsed_body['amount'] || 10).to_i
      med = data['medications']&.find { |m| m['id'] == med_id }
      if med
        med['stock'] = (med['stock'] || 0) + amount
        MedicineDB.save_data(data)
        return json_response(200, { success: true, stock: med['stock'] })
      end
      return json_response(404, { error: 'Medication not found' })
    end

    # Update: PUT /api/medications/:id
    if method == 'PUT' && path =~ %r{\A/api/medications/([^/]+)\z}
      med_id = Regexp.last_match(1)
      idx = data['medications']&.find_index { |m| m['id'] == med_id }
      if idx
        updated = data['medications'][idx].merge(parsed_body)
        updated['id'] = med_id
        data['medications'][idx] = updated
        MedicineDB.save_data(data)
        return json_response(200, { success: true, medication: updated })
      end
      return json_response(404, { error: 'Medication not found' })
    end

    # Delete: DELETE /api/medications/:id
    if method == 'DELETE' && path =~ %r{\A/api/medications/([^/]+)\z}
      med_id = Regexp.last_match(1)
      data['medications']&.reject! { |m| m['id'] == med_id }
      data['logs']&.reject! { |l| l['medId'] == med_id }
      MedicineDB.save_data(data)
      return json_response(200, { success: true })
    end

    # --- 4. Dose Logs Endpoints ---
    if method == 'GET' && path == '/api/logs'
      return json_response(200, data['logs'] || [])
    end

    if method == 'POST' && path == '/api/logs'
      log = parsed_body
      log['id'] ||= "log_#{Time.now.to_i}_#{rand(1000)}"
      data['logs'] ||= []
      data['logs'].unshift(log)

      # Auto-decrement inventory stock on 'taken'
      if log['status'] == 'taken' && log['medId']
        med = data['medications']&.find { |m| m['id'] == log['medId'] }
        if med && med['stock'].to_i.positive?
          med['stock'] = med['stock'].to_i - 1
        end
      end

      MedicineDB.save_data(data)
      return json_response(201, { success: true, log: log })
    end

    if method == 'DELETE' && path == '/api/logs'
      data['logs'] = []
      MedicineDB.save_data(data)
      return json_response(200, { success: true })
    end

    # --- 5. Settings Endpoints ---
    if method == 'GET' && path == '/api/settings'
      return json_response(200, data['settings'] || {})
    end

    if method == 'POST' && path == '/api/settings'
      data['settings'] = (data['settings'] || {}).merge(parsed_body)
      MedicineDB.save_data(data)
      return json_response(200, { success: true, settings: data['settings'] })
    end

    # --- 6. AI Interaction & Safety Check ---
    if method == 'POST' && path == '/api/ai/audit'
      result = DrugSafetyEngine.audit(data['medications'] || [])
      return json_response(200, result)
    end

    # --- 7. Static File Serving ---
    serve_static_file(path)
  end

  def self.serve_static_file(req_path)
    clean_path = req_path.split('?').first
    clean_path = '/index.html' if clean_path == '/' || clean_path == ''

    file_rel = clean_path.gsub(%r{\A/+}, '').tr('/', File::SEPARATOR)
    full_path = File.expand_path(file_rel, STATIC_DIR)

    if full_path.start_with?(STATIC_DIR) && File.file?(full_path)
      ext = File.extname(full_path).downcase
      content_type = MIME_TYPES[ext] || 'application/octet-stream'
      body = File.binread(full_path)
      response(200, body, content_type)
    else
      response(404, "404 Not Found: #{clean_path}\n", 'text/plain')
    end
  end

  def self.json_response(status, payload)
    response(status, JSON.generate(payload), 'application/json; charset=utf-8')
  end

  def self.response(status, body, content_type = 'text/plain')
    {
      status: status,
      headers: {
        'Content-Type' => content_type,
        'Content-Length' => body.bytesize.to_s,
        'Access-Control-Allow-Origin' => '*',
        'Access-Control-Allow-Methods' => 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers' => 'Content-Type'
      },
      body: body
    }
  end
end

# --- WEBRICK SERVER ENGINE ---
begin
  require 'webrick'
  HAVE_WEBRICK = true
rescue LoadError
  HAVE_WEBRICK = false
end

class MediPulseWebrickServer
  def self.start(port)
    server = WEBrick::HTTPServer.new(
      Port: port,
      BindAddress: '0.0.0.0',
      Logger: WEBrick::Log.new($stderr, WEBrick::BasicLog::WARN),
      AccessLog: []
    )

    server.mount_proc '/' do |req, res|
      handled = MediPulseRouter.handle(req.request_method, req.path, req.body)
      res.status = handled[:status]
      handled[:headers].each { |k, v| res[k] = v }
      res.body = handled[:body]
    end

    trap('INT') { server.shutdown }
    trap('TERM') { server.shutdown }

    puts '=' * 65
    puts "🚀 MediPulse Ruby Backend Running (WEBrick Engine)!"
    puts "📍 Local URL:     http://localhost:#{port}"
    puts "💎 Ruby Version:  #{RUBY_VERSION}"
    puts "📁 Storage File:  #{DATA_FILE}"
    puts '=' * 65
    puts "Press Ctrl+C to stop.\n"

    server.start
  end
end

# --- PURE RUBY TCPSERVER (Fallback Engine) ---
class PureRubyServer
  def self.start(port)
    server = TCPServer.new('0.0.0.0', port)
    puts '=' * 65
    puts "🚀 MediPulse Ruby Backend Running (Pure Ruby TCPServer Engine)!"
    puts "📍 Local URL:     http://localhost:#{port}"
    puts "💎 Ruby Version:  #{RUBY_VERSION}"
    puts "📁 Storage File:  #{DATA_FILE}"
    puts '=' * 65
    puts "Press Ctrl+C to stop.\n"

    loop do
      client = server.accept
      Thread.new(client) do |socket|
        begin
          req_line = socket.gets
          next unless req_line

          method, full_path, = req_line.split
          headers = {}

          while (line = socket.gets)
            line = line.strip
            break if line.empty?

            k, v = line.split(':', 2)
            headers[k.strip.downcase] = v.strip if k && v
          end

          content_len = headers['content-length'].to_i
          body = content_len.positive? ? socket.read(content_len) : ''

          res = MediPulseRouter.handle(method, full_path, body)

          status_text = case res[:status]
                        when 200 then 'OK'
                        when 201 then 'Created'
                        when 204 then 'No Content'
                        when 404 then 'Not Found'
                        when 500 then 'Internal Error'
                        else 'Status'
                        end

          socket.print "HTTP/1.1 #{res[:status]} #{status_text}\r\n"
          res[:headers].each do |hk, hv|
            socket.print "#{hk}: #{hv}\r\n"
          end
          socket.print "Connection: close\r\n\r\n"
          socket.print res[:body]
        rescue StandardError => e
          warn "Request processing error: #{e.message}"
        ensure
          socket.close
        end
      end
    end
  end
end

# --- LAUNCH SERVER ---
if __FILE__ == $PROGRAM_NAME
  MedicineDB.load_data
  if HAVE_WEBRICK
    MediPulseWebrickServer.start(PORT)
  else
    PureRubyServer.start(PORT)
  end
end
