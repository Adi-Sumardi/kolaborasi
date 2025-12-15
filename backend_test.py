#!/usr/bin/env python3
"""
Comprehensive Backend Testing for Jobdesk Edit/Delete Endpoints and 401 Auto-Logout
Testing Agent - Backend API Testing Script
"""

import requests
import json
import sys
from datetime import datetime, timedelta
import uuid

# Configuration
BASE_URL = "https://workspaces-2.preview.emergentagent.com/api"

# Test credentials
CREDENTIALS = {
    "super_admin": {"email": "admin@workspace.com", "password": "password123"},
    "pengurus": {"email": "pengurus@workspace.com", "password": "password123"},
    "karyawan": {"email": "karyawan1@workspace.com", "password": "password123"}
}

class BackendTester:
    def __init__(self):
        self.tokens = {}
        self.test_jobdesk_id = None
        self.test_results = []
        
    def log_result(self, test_name, success, message, details=None):
        """Log test result"""
        status = "✅ PASS" if success else "❌ FAIL"
        result = {
            "test": test_name,
            "status": status,
            "message": message,
            "details": details or {},
            "timestamp": datetime.now().isoformat()
        }
        self.test_results.append(result)
        print(f"{status}: {test_name} - {message}")
        if details:
            print(f"   Details: {details}")
        print()

    def login_user(self, role):
        """Login and get token for a specific role"""
        try:
            creds = CREDENTIALS[role]
            response = requests.post(f"{BASE_URL}/auth/login", json=creds)
            
            if response.status_code == 200:
                data = response.json()
                self.tokens[role] = data["token"]
                self.log_result(f"Login {role}", True, f"Successfully logged in as {role}")
                return True
            else:
                self.log_result(f"Login {role}", False, f"Login failed: {response.text}")
                return False
        except Exception as e:
            self.log_result(f"Login {role}", False, f"Login error: {str(e)}")
            return False

    def get_auth_headers(self, role):
        """Get authorization headers for a role"""
        if role not in self.tokens:
            return None
        return {"Authorization": f"Bearer {self.tokens[role]}"}

    def create_test_jobdesk(self):
        """Create a test jobdesk for testing edit/delete operations"""
        try:
            headers = self.get_auth_headers("super_admin")
            if not headers:
                self.log_result("Create Test Jobdesk", False, "No super_admin token available")
                return False

            # Get users to assign
            users_response = requests.get(f"{BASE_URL}/users", headers=headers)
            if users_response.status_code != 200:
                self.log_result("Create Test Jobdesk", False, "Failed to get users list")
                return False
            
            users = users_response.json()["users"]
            karyawan_users = [u["id"] for u in users if u["role"] == "karyawan"][:2]  # Get first 2 karyawan
            
            if not karyawan_users:
                self.log_result("Create Test Jobdesk", False, "No karyawan users found")
                return False

            jobdesk_data = {
                "title": f"Test Jobdesk for Edit/Delete - {datetime.now().strftime('%Y%m%d_%H%M%S')}",
                "description": "This is a test jobdesk created for testing edit and delete functionality",
                "assignedTo": karyawan_users,
                "dueDate": (datetime.now() + timedelta(days=7)).isoformat(),
                "priority": "high"
            }

            response = requests.post(f"{BASE_URL}/jobdesks", json=jobdesk_data, headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                self.test_jobdesk_id = data["jobdesk"]["id"]
                self.log_result("Create Test Jobdesk", True, f"Created test jobdesk with ID: {self.test_jobdesk_id}")
                return True
            else:
                self.log_result("Create Test Jobdesk", False, f"Failed to create jobdesk: {response.text}")
                return False
                
        except Exception as e:
            self.log_result("Create Test Jobdesk", False, f"Error creating test jobdesk: {str(e)}")
            return False

    def test_jobdesk_edit_authorization(self):
        """Test jobdesk edit endpoint authorization"""
        if not self.test_jobdesk_id:
            self.log_result("Edit Authorization Tests", False, "No test jobdesk available")
            return

        edit_data = {
            "title": "Updated Test Jobdesk Title",
            "description": "Updated description for testing"
        }

        # Test 1: Super Admin should be able to edit
        try:
            headers = self.get_auth_headers("super_admin")
            response = requests.put(f"{BASE_URL}/jobdesks/{self.test_jobdesk_id}", json=edit_data, headers=headers)
            
            if response.status_code == 200:
                self.log_result("Edit Auth - Super Admin", True, "Super admin can edit jobdesk")
            else:
                self.log_result("Edit Auth - Super Admin", False, f"Super admin edit failed: {response.text}")
        except Exception as e:
            self.log_result("Edit Auth - Super Admin", False, f"Error: {str(e)}")

        # Test 2: Pengurus should be able to edit
        try:
            headers = self.get_auth_headers("pengurus")
            edit_data["title"] = "Updated by Pengurus"
            response = requests.put(f"{BASE_URL}/jobdesks/{self.test_jobdesk_id}", json=edit_data, headers=headers)
            
            if response.status_code == 200:
                self.log_result("Edit Auth - Pengurus", True, "Pengurus can edit jobdesk")
            else:
                self.log_result("Edit Auth - Pengurus", False, f"Pengurus edit failed: {response.text}")
        except Exception as e:
            self.log_result("Edit Auth - Pengurus", False, f"Error: {str(e)}")

        # Test 3: Karyawan should NOT be able to edit
        try:
            headers = self.get_auth_headers("karyawan")
            edit_data["title"] = "Attempted edit by Karyawan"
            response = requests.put(f"{BASE_URL}/jobdesks/{self.test_jobdesk_id}", json=edit_data, headers=headers)
            
            if response.status_code == 403:
                self.log_result("Edit Auth - Karyawan", True, "Karyawan correctly denied edit access (403)")
            else:
                self.log_result("Edit Auth - Karyawan", False, f"Karyawan should be denied but got: {response.status_code} - {response.text}")
        except Exception as e:
            self.log_result("Edit Auth - Karyawan", False, f"Error: {str(e)}")

        # Test 4: No auth token should fail
        try:
            response = requests.put(f"{BASE_URL}/jobdesks/{self.test_jobdesk_id}", json=edit_data)
            
            if response.status_code == 403:
                self.log_result("Edit Auth - No Token", True, "No auth token correctly denied (403)")
            else:
                self.log_result("Edit Auth - No Token", False, f"Should be denied but got: {response.status_code} - {response.text}")
        except Exception as e:
            self.log_result("Edit Auth - No Token", False, f"Error: {str(e)}")

    def test_jobdesk_edit_validation(self):
        """Test jobdesk edit endpoint validation"""
        if not self.test_jobdesk_id:
            self.log_result("Edit Validation Tests", False, "No test jobdesk available")
            return

        headers = self.get_auth_headers("super_admin")
        if not headers:
            self.log_result("Edit Validation Tests", False, "No super_admin token available")
            return

        # Test 1: No fields to update should fail
        try:
            response = requests.put(f"{BASE_URL}/jobdesks/{self.test_jobdesk_id}", json={}, headers=headers)
            
            if response.status_code == 400:
                self.log_result("Edit Validation - Empty Update", True, "Empty update correctly rejected (400)")
            else:
                self.log_result("Edit Validation - Empty Update", False, f"Should reject empty update but got: {response.status_code} - {response.text}")
        except Exception as e:
            self.log_result("Edit Validation - Empty Update", False, f"Error: {str(e)}")

        # Test 2: Invalid jobdesk ID should return 404
        try:
            invalid_id = str(uuid.uuid4())
            edit_data = {"title": "Test update"}
            response = requests.put(f"{BASE_URL}/jobdesks/{invalid_id}", json=edit_data, headers=headers)
            
            if response.status_code == 404:
                self.log_result("Edit Validation - Invalid ID", True, "Invalid jobdesk ID correctly returns 404")
            else:
                self.log_result("Edit Validation - Invalid ID", False, f"Should return 404 but got: {response.status_code} - {response.text}")
        except Exception as e:
            self.log_result("Edit Validation - Invalid ID", False, f"Error: {str(e)}")

        # Test 3: Valid data should work
        try:
            edit_data = {
                "title": "Successfully Updated Jobdesk",
                "description": "Updated description with validation test",
                "priority": "medium"
            }
            response = requests.put(f"{BASE_URL}/jobdesks/{self.test_jobdesk_id}", json=edit_data, headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                if data.get("jobdesk") and data["jobdesk"]["title"] == edit_data["title"]:
                    self.log_result("Edit Validation - Valid Data", True, "Valid update successful with correct response")
                else:
                    self.log_result("Edit Validation - Valid Data", False, f"Update successful but response incorrect: {data}")
            else:
                self.log_result("Edit Validation - Valid Data", False, f"Valid update failed: {response.text}")
        except Exception as e:
            self.log_result("Edit Validation - Valid Data", False, f"Error: {str(e)}")

    def test_jobdesk_delete_authorization(self):
        """Test jobdesk delete endpoint authorization"""
        if not self.test_jobdesk_id:
            self.log_result("Delete Authorization Tests", False, "No test jobdesk available")
            return

        # Test 1: Pengurus should NOT be able to delete
        try:
            headers = self.get_auth_headers("pengurus")
            response = requests.delete(f"{BASE_URL}/jobdesks/{self.test_jobdesk_id}", headers=headers)
            
            if response.status_code == 403:
                self.log_result("Delete Auth - Pengurus", True, "Pengurus correctly denied delete access (403)")
            else:
                self.log_result("Delete Auth - Pengurus", False, f"Pengurus should be denied but got: {response.status_code} - {response.text}")
        except Exception as e:
            self.log_result("Delete Auth - Pengurus", False, f"Error: {str(e)}")

        # Test 2: Karyawan should NOT be able to delete
        try:
            headers = self.get_auth_headers("karyawan")
            response = requests.delete(f"{BASE_URL}/jobdesks/{self.test_jobdesk_id}", headers=headers)
            
            if response.status_code == 403:
                self.log_result("Delete Auth - Karyawan", True, "Karyawan correctly denied delete access (403)")
            else:
                self.log_result("Delete Auth - Karyawan", False, f"Karyawan should be denied but got: {response.status_code} - {response.text}")
        except Exception as e:
            self.log_result("Delete Auth - Karyawan", False, f"Error: {str(e)}")

        # Test 3: No auth token should fail
        try:
            response = requests.delete(f"{BASE_URL}/jobdesks/{self.test_jobdesk_id}")
            
            if response.status_code == 403:
                self.log_result("Delete Auth - No Token", True, "No auth token correctly denied (403)")
            else:
                self.log_result("Delete Auth - No Token", False, f"Should be denied but got: {response.status_code} - {response.text}")
        except Exception as e:
            self.log_result("Delete Auth - No Token", False, f"Error: {str(e)}")

    def test_jobdesk_delete_validation(self):
        """Test jobdesk delete endpoint validation"""
        headers = self.get_auth_headers("super_admin")
        if not headers:
            self.log_result("Delete Validation Tests", False, "No super_admin token available")
            return

        # Test 1: Invalid jobdesk ID should return 404
        try:
            invalid_id = str(uuid.uuid4())
            response = requests.delete(f"{BASE_URL}/jobdesks/{invalid_id}", headers=headers)
            
            if response.status_code == 404:
                self.log_result("Delete Validation - Invalid ID", True, "Invalid jobdesk ID correctly returns 404")
            else:
                self.log_result("Delete Validation - Invalid ID", False, f"Should return 404 but got: {response.status_code} - {response.text}")
        except Exception as e:
            self.log_result("Delete Validation - Invalid ID", False, f"Error: {str(e)}")

    def test_jobdesk_delete_cascade(self):
        """Test jobdesk delete cascade functionality"""
        if not self.test_jobdesk_id:
            self.log_result("Delete Cascade Tests", False, "No test jobdesk available")
            return

        headers = self.get_auth_headers("super_admin")
        if not headers:
            self.log_result("Delete Cascade Tests", False, "No super_admin token available")
            return

        # Create some related data first (todos, attachments)
        try:
            # Create a todo linked to this jobdesk
            todo_data = {
                "title": "Test Todo for Cascade Delete",
                "description": "This todo should have jobdeskId removed after jobdesk deletion",
                "jobdeskId": self.test_jobdesk_id,
                "status": "pending"
            }
            
            karyawan_headers = self.get_auth_headers("karyawan")
            if karyawan_headers:
                todo_response = requests.post(f"{BASE_URL}/todos", json=todo_data, headers=karyawan_headers)
                if todo_response.status_code == 200:
                    todo_id = todo_response.json()["todo"]["id"]
                    self.log_result("Create Test Todo", True, f"Created test todo: {todo_id}")
                else:
                    self.log_result("Create Test Todo", False, f"Failed to create test todo: {todo_response.text}")

            # Now delete the jobdesk
            response = requests.delete(f"{BASE_URL}/jobdesks/{self.test_jobdesk_id}", headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                if data.get("deletedJobdeskId") == self.test_jobdesk_id:
                    self.log_result("Delete Cascade - Success", True, "Jobdesk successfully deleted with cascade")
                    
                    # Verify jobdesk is actually deleted
                    verify_response = requests.get(f"{BASE_URL}/jobdesks", headers=headers)
                    if verify_response.status_code == 200:
                        jobdesks = verify_response.json()["jobdesks"]
                        deleted_jobdesk = next((j for j in jobdesks if j["id"] == self.test_jobdesk_id), None)
                        if not deleted_jobdesk:
                            self.log_result("Delete Cascade - Verification", True, "Jobdesk confirmed deleted from database")
                        else:
                            self.log_result("Delete Cascade - Verification", False, "Jobdesk still exists in database")
                    
                    # Reset test_jobdesk_id since it's deleted
                    self.test_jobdesk_id = None
                else:
                    self.log_result("Delete Cascade - Success", False, f"Delete response incorrect: {data}")
            else:
                self.log_result("Delete Cascade - Success", False, f"Delete failed: {response.text}")
                
        except Exception as e:
            self.log_result("Delete Cascade Tests", False, f"Error: {str(e)}")

    def test_401_auto_logout(self):
        """Test 401 authentication handling"""
        # Test 1: Invalid token should return 401
        try:
            invalid_headers = {"Authorization": "Bearer invalid_token_12345"}
            response = requests.get(f"{BASE_URL}/auth/me", headers=invalid_headers)
            
            if response.status_code == 401:
                self.log_result("401 Auto-Logout - Invalid Token", True, "Invalid token correctly returns 401")
            else:
                self.log_result("401 Auto-Logout - Invalid Token", False, f"Should return 401 but got: {response.status_code} - {response.text}")
        except Exception as e:
            self.log_result("401 Auto-Logout - Invalid Token", False, f"Error: {str(e)}")

        # Test 2: Expired token should return 401 (simulate with malformed token)
        try:
            expired_headers = {"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.expired.token"}
            response = requests.get(f"{BASE_URL}/auth/me", headers=expired_headers)
            
            if response.status_code == 401:
                self.log_result("401 Auto-Logout - Expired Token", True, "Expired token correctly returns 401")
            else:
                self.log_result("401 Auto-Logout - Expired Token", False, f"Should return 401 but got: {response.status_code} - {response.text}")
        except Exception as e:
            self.log_result("401 Auto-Logout - Expired Token", False, f"Error: {str(e)}")

        # Test 3: No token should return 401
        try:
            response = requests.get(f"{BASE_URL}/auth/me")
            
            if response.status_code == 401:
                self.log_result("401 Auto-Logout - No Token", True, "No token correctly returns 401")
            else:
                self.log_result("401 Auto-Logout - No Token", False, f"Should return 401 but got: {response.status_code} - {response.text}")
        except Exception as e:
            self.log_result("401 Auto-Logout - No Token", False, f"Error: {str(e)}")

    def run_all_tests(self):
        """Run all backend tests"""
        print("=" * 80)
        print("COMPREHENSIVE BACKEND TESTING - JOBDESK EDIT/DELETE & 401 AUTO-LOGOUT")
        print("=" * 80)
        print()

        # Step 1: Login all users
        print("🔐 AUTHENTICATION SETUP")
        print("-" * 40)
        for role in ["super_admin", "pengurus", "karyawan"]:
            self.login_user(role)

        # Step 2: Create test jobdesk
        print("📝 TEST DATA SETUP")
        print("-" * 40)
        self.create_test_jobdesk()

        # Step 3: Test jobdesk edit endpoint
        print("✏️ JOBDESK EDIT ENDPOINT TESTS")
        print("-" * 40)
        self.test_jobdesk_edit_authorization()
        self.test_jobdesk_edit_validation()

        # Step 4: Test jobdesk delete endpoint
        print("🗑️ JOBDESK DELETE ENDPOINT TESTS")
        print("-" * 40)
        self.test_jobdesk_delete_authorization()
        self.test_jobdesk_delete_validation()
        self.test_jobdesk_delete_cascade()

        # Step 5: Test 401 auto-logout
        print("🚫 401 AUTO-LOGOUT TESTS")
        print("-" * 40)
        self.test_401_auto_logout()

        # Summary
        self.print_summary()

    def print_summary(self):
        """Print test summary"""
        print("=" * 80)
        print("TEST SUMMARY")
        print("=" * 80)
        
        passed = len([r for r in self.test_results if "✅ PASS" in r["status"]])
        failed = len([r for r in self.test_results if "❌ FAIL" in r["status"]])
        total = len(self.test_results)
        
        print(f"Total Tests: {total}")
        print(f"Passed: {passed} ✅")
        print(f"Failed: {failed} ❌")
        print(f"Success Rate: {(passed/total*100):.1f}%")
        print()
        
        if failed > 0:
            print("FAILED TESTS:")
            print("-" * 40)
            for result in self.test_results:
                if "❌ FAIL" in result["status"]:
                    print(f"❌ {result['test']}: {result['message']}")
            print()
        
        print("DETAILED RESULTS:")
        print("-" * 40)
        for result in self.test_results:
            print(f"{result['status']}: {result['test']}")
            print(f"   Message: {result['message']}")
            if result['details']:
                print(f"   Details: {result['details']}")
            print()

if __name__ == "__main__":
    tester = BackendTester()
    tester.run_all_tests()