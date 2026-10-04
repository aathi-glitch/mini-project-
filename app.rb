# frozen_string_literal: true
# ==============================================================================
# MediPulse - Sinatra Edition (Ruby Microframework Backend)
# Run via: bundle exec ruby app.rb (or ruby server.rb for pure Ruby setup)
# ==============================================================================

require 'sinatra'
require 'json'
require 'time'
require_relative 'server'

set :port, 8000
set :bind, '0.0.0.0'
set :public_folder, File.dirname(__FILE__)

# Enable CORS for all routes
before do
  content_type :json
  headers 'Access-Control-Allow-Origin' => '*',
          'Access-Control-Allow-Methods' => 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers' => 'Content-Type'
end

options '*' do
  204
end

helpers do
  def json_body
    request.body.rewind
    raw = request.body.read
    raw.empty? ? {} : JSON.parse(raw)
  rescue StandardError
    {}
  end
end

# Root: Serve index.html
get '/' do
  content_type :html
  send_file File.join(settings.public_folder, 'index.html')
end

# Status
get '/api/status' do
  {
    status: 'online',
    engine: "Sinatra / Ruby #{RUBY_VERSION}",
    server: 'WEBrick / Sinatra',
    persistence: 'JSON File Store',
    timestamp: Time.now.iso8601
  }.to_json
end

# Analytics & Adherence Summary
get '/api/analytics' do
  db = MedicineDB.load_data
  AdherenceAnalytics.compute(db['medications'] || [], db['logs'] || []).to_json
end

# Medications
get '/api/medications' do
  db = MedicineDB.load_data
  (db['medications'] || []).to_json
end

post '/api/medications' do
  db = MedicineDB.load_data
  item = json_body
  item['id'] ||= "med_#{Time.now.to_i}_#{rand(1000)}"
  db['medications'] ||= []
  db['medications'] << item
  MedicineDB.save_data(db)
  status 201
  { success: true, medication: item }.to_json
end

post '/api/medications/:id/refill' do
  db = MedicineDB.load_data
  med = db['medications']&.find { |m| m['id'] == params[:id] }
  if med
    amount = (json_body['amount'] || 10).to_i
    med['stock'] = (med['stock'] || 0) + amount
    MedicineDB.save_data(db)
    return { success: true, stock: med['stock'] }.to_json
  end
  status 404
  { error: 'Medication not found' }.to_json
end

put '/api/medications/:id' do
  db = MedicineDB.load_data
  idx = db['medications']&.find_index { |m| m['id'] == params[:id] }
  if idx
    updated = db['medications'][idx].merge(json_body)
    updated['id'] = params[:id]
    db['medications'][idx] = updated
    MedicineDB.save_data(db)
    return { success: true, medication: updated }.to_json
  end
  status 404
  { error: 'Medication not found' }.to_json
end

delete '/api/medications/:id' do
  db = MedicineDB.load_data
  db['medications']&.reject! { |m| m['id'] == params[:id] }
  db['logs']&.reject! { |l| l['medId'] == params[:id] }
  MedicineDB.save_data(db)
  { success: true }.to_json
end

# Dose Logs
get '/api/logs' do
  db = MedicineDB.load_data
  (db['logs'] || []).to_json
end

post '/api/logs' do
  db = MedicineDB.load_data
  log = json_body
  log['id'] ||= "log_#{Time.now.to_i}_#{rand(1000)}"
  db['logs'] ||= []
  db['logs'].unshift(log)

  if log['status'] == 'taken' && log['medId']
    med = db['medications']&.find { |m| m['id'] == log['medId'] }
    med['stock'] = med['stock'].to_i - 1 if med && med['stock'].to_i.positive?
  end

  MedicineDB.save_data(db)
  status 201
  { success: true, log: log }.to_json
end

delete '/api/logs' do
  db = MedicineDB.load_data
  db['logs'] = []
  MedicineDB.save_data(db)
  { success: true }.to_json
end

# Settings
get '/api/settings' do
  db = MedicineDB.load_data
  (db['settings'] || {}).to_json
end

post '/api/settings' do
  db = MedicineDB.load_data
  db['settings'] = (db['settings'] || {}).merge(json_body)
  MedicineDB.save_data(db)
  { success: true, settings: db['settings'] }.to_json
end

# AI Audit
post '/api/ai/audit' do
  db = MedicineDB.load_data
  DrugSafetyEngine.audit(db['medications'] || []).to_json
end
