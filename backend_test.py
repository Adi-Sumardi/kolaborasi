#!/usr/bin/env python3
"""
Backend API Testing Script for Update User Password Feature
Tests PUT /api/users/:id/password endpoint thoroughly
"""

import requests
import json
import sys
from pymongo import MongoClient
import bcrypt
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configuration
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://collab-dash-2.preview.emergentagent.com')
API_BASE = f"{BASE_URL}/api"
MONGO_URL = os.getenv('MONGO_URL', 'mongodb://localhost:27017/workspace_collaboration')

# Test credentials
SUPER_ADMIN_CREDS = {
    "email": "admin@workspace.com",
    "password": "password123"
}

REGULAR_USER_CREDS = {
    "email": "karyawan1@workspace.com", 
    "password": "password123"
}

class PasswordUpdateTester:
    def __init__(self):
        self.session = requests.Session()
        self.auth_token = None
        self.user_id = None
        self.test_jobdesk_id = None
        self.test_todo_id = None
        
    def authenticate(self):
        """Authenticate and get JWT token"""
        print("🔐 Authenticating...")
        
        login_data = {
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        }
        
        try:
            response = self.session.post(f"{API_BASE}/auth/login", json=login_data)
            
            if response.status_code == 200:
                data = response.json()
                self.auth_token = data.get('token')
                self.user_id = data.get('user', {}).get('id')
                
                # Set authorization header for future requests
                self.session.headers.update({
                    'Authorization': f'Bearer {self.auth_token}',
                    'Content-Type': 'application/json'
                })
                
                print(f"✅ Authentication successful - User ID: {self.user_id}")
                return True
            else:
                print(f"❌ Authentication failed: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ Authentication error: {str(e)}")
            return False
    
    def setup_test_data(self):
        """Create test jobdesk and todo for testing"""
        print("\n📝 Setting up test data...")
        
        # Create test jobdesk first
        jobdesk_data = {
            "title": "Test Jobdesk for Todo Conversion",
            "description": "Test jobdesk for testing todo to log conversion",
            "assignedTo": [self.user_id],
            "dueDate": "2024-12-31"
        }
        
        try:
            response = self.session.post(f"{API_BASE}/jobdesks", json=jobdesk_data)
            if response.status_code == 200:
                self.test_jobdesk_id = response.json().get('jobdesk', {}).get('id')
                print(f"✅ Test jobdesk created - ID: {self.test_jobdesk_id}")
            else:
                print(f"❌ Failed to create test jobdesk: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            print(f"❌ Error creating test jobdesk: {str(e)}")
            return False
        
        # Create test todo with jobdesk
        todo_data = {
            "title": "Complete Project Documentation",
            "description": "Write comprehensive documentation for the new feature implementation",
            "priority": "high",
            "status": "done",  # Set to done status for conversion
            "jobdeskId": self.test_jobdesk_id,
            "dueDate": "2024-12-25"
        }
        
        try:
            response = self.session.post(f"{API_BASE}/todos", json=todo_data)
            if response.status_code == 200:
                self.test_todo_id = response.json().get('todo', {}).get('id')
                print(f"✅ Test todo created - ID: {self.test_todo_id}")
                return True
            else:
                print(f"❌ Failed to create test todo: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            print(f"❌ Error creating test todo: {str(e)}")
            return False
    
    def test_authentication_required(self):
        """Test 1: Authentication Tests"""
        print("\n🔒 Test 1: Authentication Required")
        
        # Test without auth token
        session_no_auth = requests.Session()
        session_no_auth.headers.update({'Content-Type': 'application/json'})
        
        try:
            response = session_no_auth.post(
                f"{API_BASE}/todos/{self.test_todo_id}/convert-to-log",
                json={"hoursSpent": 4.5}
            )
            
            if response.status_code == 401:
                print("✅ PASS: Unauthorized request correctly rejected (401)")
                return True
            else:
                print(f"❌ FAIL: Expected 401, got {response.status_code}")
                return False
                
        except Exception as e:
            print(f"❌ ERROR: {str(e)}")
            return False
    
    def test_validation_errors(self):
        """Test 2: Validation Tests"""
        print("\n✅ Test 2: Validation Tests")
        
        test_cases = [
            {
                "name": "Missing hoursSpent",
                "data": {},
                "expected_status": 400,
                "expected_error": "Hours spent must be greater than 0"
            },
            {
                "name": "Zero hoursSpent",
                "data": {"hoursSpent": 0},
                "expected_status": 400,
                "expected_error": "Hours spent must be greater than 0"
            },
            {
                "name": "Negative hoursSpent",
                "data": {"hoursSpent": -2.5},
                "expected_status": 400,
                "expected_error": "Hours spent must be greater than 0"
            }
        ]
        
        all_passed = True
        
        for test_case in test_cases:
            try:
                response = self.session.post(
                    f"{API_BASE}/todos/{self.test_todo_id}/convert-to-log",
                    json=test_case["data"]
                )
                
                if response.status_code == test_case["expected_status"]:
                    response_data = response.json()
                    if test_case["expected_error"] in response_data.get("error", ""):
                        print(f"✅ PASS: {test_case['name']}")
                    else:
                        print(f"❌ FAIL: {test_case['name']} - Wrong error message")
                        print(f"   Expected: {test_case['expected_error']}")
                        print(f"   Got: {response_data.get('error', 'No error message')}")
                        all_passed = False
                else:
                    print(f"❌ FAIL: {test_case['name']} - Expected {test_case['expected_status']}, got {response.status_code}")
                    all_passed = False
                    
            except Exception as e:
                print(f"❌ ERROR in {test_case['name']}: {str(e)}")
                all_passed = False
        
        return all_passed
    
    def test_nonexistent_todo(self):
        """Test 3: Non-existent Todo ID"""
        print("\n🔍 Test 3: Non-existent Todo ID")
        
        fake_todo_id = str(uuid.uuid4())
        
        try:
            response = self.session.post(
                f"{API_BASE}/todos/{fake_todo_id}/convert-to-log",
                json={"hoursSpent": 3.0}
            )
            
            if response.status_code == 404:
                response_data = response.json()
                if "Todo not found" in response_data.get("error", ""):
                    print("✅ PASS: Non-existent todo correctly returns 404")
                    return True
                else:
                    print(f"❌ FAIL: Wrong error message: {response_data.get('error')}")
                    return False
            else:
                print(f"❌ FAIL: Expected 404, got {response.status_code}")
                return False
                
        except Exception as e:
            print(f"❌ ERROR: {str(e)}")
            return False
    
    def test_todo_without_jobdesk(self):
        """Test 4: Todo without jobdeskId"""
        print("\n📋 Test 4: Todo without jobdeskId")
        
        # Create todo without jobdesk
        todo_data = {
            "title": "Personal Task Without Jobdesk",
            "description": "This task is not linked to any jobdesk",
            "status": "done"
        }
        
        try:
            response = self.session.post(f"{API_BASE}/todos", json=todo_data)
            if response.status_code != 200:
                print(f"❌ Failed to create test todo: {response.status_code}")
                return False
            
            todo_without_jobdesk_id = response.json().get('todo', {}).get('id')
            
            # Try to convert todo without jobdesk
            response = self.session.post(
                f"{API_BASE}/todos/{todo_without_jobdesk_id}/convert-to-log",
                json={"hoursSpent": 2.0}
            )
            
            if response.status_code == 400:
                response_data = response.json()
                if "Todo must have a jobdesk to convert" in response_data.get("error", ""):
                    print("✅ PASS: Todo without jobdesk correctly rejected")
                    return True
                else:
                    print(f"❌ FAIL: Wrong error message: {response_data.get('error')}")
                    return False
            else:
                print(f"❌ FAIL: Expected 400, got {response.status_code}")
                return False
                
        except Exception as e:
            print(f"❌ ERROR: {str(e)}")
            return False
    
    def test_todo_not_done_status(self):
        """Test 5: Todo with status not 'done'"""
        print("\n⏳ Test 5: Todo with status not 'done'")
        
        # Create todo with pending status
        todo_data = {
            "title": "Pending Task with Jobdesk",
            "description": "This task is still pending",
            "status": "pending",
            "jobdeskId": self.test_jobdesk_id
        }
        
        try:
            response = self.session.post(f"{API_BASE}/todos", json=todo_data)
            if response.status_code != 200:
                print(f"❌ Failed to create test todo: {response.status_code}")
                return False
            
            pending_todo_id = response.json().get('todo', {}).get('id')
            
            # Try to convert pending todo
            response = self.session.post(
                f"{API_BASE}/todos/{pending_todo_id}/convert-to-log",
                json={"hoursSpent": 1.5}
            )
            
            if response.status_code == 400:
                response_data = response.json()
                if "Todo must be in done status to convert" in response_data.get("error", ""):
                    print("✅ PASS: Pending todo correctly rejected")
                    return True
                else:
                    print(f"❌ FAIL: Wrong error message: {response_data.get('error')}")
                    return False
            else:
                print(f"❌ FAIL: Expected 400, got {response.status_code}")
                return False
                
        except Exception as e:
            print(f"❌ ERROR: {str(e)}")
            return False
    
    def test_successful_conversion(self):
        """Test 6: Successful Conversion"""
        print("\n🎯 Test 6: Successful Conversion")
        
        hours_spent = 4.5
        
        try:
            # Perform conversion
            response = self.session.post(
                f"{API_BASE}/todos/{self.test_todo_id}/convert-to-log",
                json={"hoursSpent": hours_spent}
            )
            
            if response.status_code == 200:
                response_data = response.json()
                
                # Verify response structure
                if "message" in response_data and "log" in response_data:
                    log_data = response_data["log"]
                    
                    # Verify log data
                    checks = [
                        ("userId", self.user_id),
                        ("jobdeskId", self.test_jobdesk_id),
                        ("hoursSpent", hours_spent)
                    ]
                    
                    all_checks_passed = True
                    for field, expected_value in checks:
                        if log_data.get(field) != expected_value:
                            print(f"❌ FAIL: {field} mismatch - Expected: {expected_value}, Got: {log_data.get(field)}")
                            all_checks_passed = False
                    
                    # Check notes format
                    expected_notes_prefix = "**[From To-Do]** Complete Project Documentation"
                    if not log_data.get("notes", "").startswith(expected_notes_prefix):
                        print(f"❌ FAIL: Notes format incorrect")
                        print(f"   Expected to start with: {expected_notes_prefix}")
                        print(f"   Got: {log_data.get('notes', '')}")
                        all_checks_passed = False
                    
                    if all_checks_passed:
                        print("✅ PASS: Successful conversion with correct data")
                        return True
                    else:
                        return False
                else:
                    print(f"❌ FAIL: Invalid response structure: {response_data}")
                    return False
            else:
                print(f"❌ FAIL: Expected 200, got {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ ERROR: {str(e)}")
            return False
    
    def test_already_converted_todo(self):
        """Test 7: Already Converted Todo"""
        print("\n🔄 Test 7: Already Converted Todo")
        
        try:
            # Try to convert the same todo again
            response = self.session.post(
                f"{API_BASE}/todos/{self.test_todo_id}/convert-to-log",
                json={"hoursSpent": 2.0}
            )
            
            if response.status_code == 400:
                response_data = response.json()
                if "Todo already converted to log" in response_data.get("error", ""):
                    print("✅ PASS: Already converted todo correctly rejected")
                    return True
                else:
                    print(f"❌ FAIL: Wrong error message: {response_data.get('error')}")
                    return False
            else:
                print(f"❌ FAIL: Expected 400, got {response.status_code}")
                return False
                
        except Exception as e:
            print(f"❌ ERROR: {str(e)}")
            return False
    
    def verify_database_entries(self):
        """Test 8: Database Verification"""
        print("\n🗄️ Test 8: Database Verification")
        
        try:
            # Check daily logs
            response = self.session.get(f"{API_BASE}/daily-logs")
            if response.status_code == 200:
                logs = response.json().get("logs", [])
                
                # Find our converted log
                converted_log = None
                for log in logs:
                    if (log.get("jobdeskId") == self.test_jobdesk_id and 
                        "**[From To-Do]**" in log.get("notes", "")):
                        converted_log = log
                        break
                
                if converted_log:
                    print("✅ PASS: Daily log entry found in database")
                    
                    # Check todos to verify convertedToLog flag
                    response = self.session.get(f"{API_BASE}/todos")
                    if response.status_code == 200:
                        todos = response.json().get("todos", [])
                        
                        converted_todo = None
                        for todo in todos:
                            if todo.get("id") == self.test_todo_id:
                                converted_todo = todo
                                break
                        
                        if converted_todo and converted_todo.get("convertedToLog"):
                            print("✅ PASS: Todo convertedToLog flag updated correctly")
                            return True
                        else:
                            print("❌ FAIL: Todo convertedToLog flag not updated")
                            return False
                    else:
                        print(f"❌ FAIL: Could not fetch todos: {response.status_code}")
                        return False
                else:
                    print("❌ FAIL: Converted log not found in database")
                    return False
            else:
                print(f"❌ FAIL: Could not fetch daily logs: {response.status_code}")
                return False
                
        except Exception as e:
            print(f"❌ ERROR: {str(e)}")
            return False
    
    def run_all_tests(self):
        """Run all tests in sequence"""
        print("🚀 Starting To-Do to Daily Log Conversion API Tests")
        print("=" * 60)
        
        # Authenticate first
        if not self.authenticate():
            print("❌ Authentication failed. Cannot proceed with tests.")
            return False
        
        # Setup test data
        if not self.setup_test_data():
            print("❌ Test data setup failed. Cannot proceed with tests.")
            return False
        
        # Run all tests
        test_results = []
        
        test_methods = [
            ("Authentication Required", self.test_authentication_required),
            ("Validation Tests", self.test_validation_errors),
            ("Non-existent Todo", self.test_nonexistent_todo),
            ("Todo without Jobdesk", self.test_todo_without_jobdesk),
            ("Todo not Done Status", self.test_todo_not_done_status),
            ("Successful Conversion", self.test_successful_conversion),
            ("Already Converted Todo", self.test_already_converted_todo),
            ("Database Verification", self.verify_database_entries)
        ]
        
        for test_name, test_method in test_methods:
            try:
                result = test_method()
                test_results.append((test_name, result))
            except Exception as e:
                print(f"❌ CRITICAL ERROR in {test_name}: {str(e)}")
                test_results.append((test_name, False))
        
        # Print summary
        print("\n" + "=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        
        passed = 0
        failed = 0
        
        for test_name, result in test_results:
            status = "✅ PASS" if result else "❌ FAIL"
            print(f"{status}: {test_name}")
            if result:
                passed += 1
            else:
                failed += 1
        
        print(f"\nTotal Tests: {len(test_results)}")
        print(f"Passed: {passed}")
        print(f"Failed: {failed}")
        
        if failed == 0:
            print("\n🎉 ALL TESTS PASSED! The To-Do to Daily Log conversion API is working correctly.")
            return True
        else:
            print(f"\n⚠️  {failed} test(s) failed. Please review the issues above.")
            return False

def main():
    """Main function to run the tests"""
    tester = TodoConversionTester()
    success = tester.run_all_tests()
    
    if success:
        exit(0)
    else:
        exit(1)

if __name__ == "__main__":
    main()