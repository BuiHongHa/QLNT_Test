from flask import Flask
from flask_cors import CORS
from flask_jwt_extended import JWTManager
import os
from datetime import timedelta
from mock_time import refresh_mock_state_for_startup

from api.student import student_bp
from api.teacher import teacher_bp
from api.login import login_bp
from api.dormroom import dormroom_bp
from api.class_api import class_bp
from api.access_log import access_log_bp
from api.leave import leave_bp
from api.meal import meal_bp
from api.debug import debug_bp
from api.dashboard import dashboard_bp
from api.inspection import inspection_bp
from api.inspection_criteria import criteria_bp
from api.trash import trash_bp
from api.dorm_attendance import dorm_attendance_bp

app = Flask(__name__)
refresh_mock_state_for_startup()
app.config['JWT_SECRET_KEY'] = os.environ.get('JWT_SECRET_KEY', 'default-fallback-secret-key')
app.config['JWT_TOKEN_LOCATION'] = ['headers', 'cookies']
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(minutes=15)
app.config['JWT_REFRESH_TOKEN_EXPIRES'] = timedelta(days=30)
app.config['JWT_REFRESH_COOKIE_PATH'] = '/api/login'
app.config['JWT_COOKIE_CSRF_PROTECT'] = False
app.config['JWT_COOKIE_SECURE'] = os.environ.get('JWT_COOKIE_SECURE', 'false').lower() == 'true'
app.config['JWT_COOKIE_SAMESITE'] = os.environ.get('JWT_COOKIE_SAMESITE', 'Lax')
app.config['CORS_SUPPORTS_CREDENTIALS'] = True
jwt = JWTManager(app)
CORS(app) # Cho phép Cross-Origin để Frontend (React) có thể gọi API

# Đăng ký các blueprint
app.register_blueprint(student_bp, url_prefix='/api/student')
app.register_blueprint(teacher_bp, url_prefix='/api/teacher')
app.register_blueprint(login_bp, url_prefix='/api/login')
app.register_blueprint(dormroom_bp, url_prefix='/api/dormroom')
app.register_blueprint(class_bp, url_prefix='/api/class')
app.register_blueprint(access_log_bp, url_prefix='/api/access_log')
app.register_blueprint(leave_bp, url_prefix='/api/leave')
app.register_blueprint(meal_bp, url_prefix='/api/meal')
app.register_blueprint(debug_bp, url_prefix='/api/debug')
app.register_blueprint(dashboard_bp, url_prefix='/api/dashboard')
app.register_blueprint(inspection_bp, url_prefix='/api/inspection')
app.register_blueprint(criteria_bp, url_prefix='/api/inspection/criteria')
app.register_blueprint(trash_bp, url_prefix='/api/trash')
app.register_blueprint(dorm_attendance_bp, url_prefix='/api/dorm-attendance')

@app.route('/')
def index():
    return "Boarding Student Manager API is running!"

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
