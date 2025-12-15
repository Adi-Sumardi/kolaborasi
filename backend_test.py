#!/usr/bin/env python3
"""
Backend API Testing for Jobdesk Edit and Delete Functionality
Testing the current state of jobdesk CRUD operations
"""

import requests
import json
import sys
from datetime import datetime

# Configuration
BASE_URL = "https://collab-dash-2.preview.emergentagent.com/api"

# Test credentials
CREDENTIALS = {
    "super_admin": {"email": "admin@workspace.com", "password": "password123"},
    "pengurus": {"email": "pengurus@workspace.com", "password": "password123"},
    "karyawan": {"email": "karyawan1@workspace.com", "password": "password123"}
}

class JobdeskAPITester:
    def __init__(self):
        self.tokens = {}
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

    def authenticate(self, role):
        """Authenticate and get JWT token"""
        try:
            creds = CREDENTIALS[role]
            response = requests.post(f"{BASE_URL}/auth/login", json=creds)
            
            if response.status_code == 200:
                data = response.json()
                token = data.get('token')
                if token:
                    self.tokens[role] = token
                    self.log_result(f"Authentication - {role}", True, f"Successfully authenticated as {role}")
                    return token
                else:
                    self.log_result(f"Authentication - {role}", False, "No token in response", {"response": data})
                    return None
            else:
                self.log_result(f"Authentication - {role}", False, f"Login failed with status {response.status_code}", {"response": response.text})
                return None
                
        except Exception as e:
            self.log_result(f"Authentication - {role}", False, f"Authentication error: {str(e)}")
            return None

    def get_headers(self, role):
        """Get headers with auth token"""
        token = self.tokens.get(role)
        if not token:
            return None
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }

    def test_get_jobdesks(self, role="super_admin"):
        """Test getting jobdesks list"""
        try:
            headers = self.get_headers(role)
            if not headers:
                self.log_result("Get Jobdesks", False, f"No auth token for {role}")
                return None
                
            response = requests.get(f"{BASE_URL}/jobdesks", headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                jobdesks = data.get('jobdesks', [])
                self.log_result("Get Jobdesks", True, f"Retrieved {len(jobdesks)} jobdesks", {"count": len(jobdesks)})
                return jobdesks
            else:
                self.log_result("Get Jobdesks", False, f"Failed with status {response.status_code}", {"response": response.text})
                return None
                
        except Exception as e:
            self.log_result("Get Jobdesks", False, f"Error: {str(e)}")
            return None

    def test_jobdesk_edit_endpoint(self, jobdesk_id, role="super_admin"):
        """Test if jobdesk edit endpoint exists"""
        try:
            headers = self.get_headers(role)
            if not headers:
                self.log_result("Jobdesk Edit Endpoint Check", False, f"No auth token for {role}")
                return False
                
            # Test data for edit
            edit_data = {
                "title": "Updated Test Jobdesk Title",
                "description": "Updated description for testing",
                "priority": "high"
            }
            
            response = requests.put(f"{BASE_URL}/jobdesks/{jobdesk_id}", headers=headers, json=edit_data)
            
            if response.status_code == 404:
                self.log_result("Jobdesk Edit Endpoint Check", False, "Edit endpoint NOT IMPLEMENTED - returns 404", {"status_code": 404, "response": response.text})
                return False
            elif response.status_code == 200:
                self.log_result("Jobdesk Edit Endpoint Check", True, "Edit endpoint exists and working", {"status_code": 200})
                return True
            elif response.status_code == 403:
                self.log_result("Jobdesk Edit Endpoint Check", True, f"Edit endpoint exists but {role} lacks permission", {"status_code": 403})
                return True
            else:
                self.log_result("Jobdesk Edit Endpoint Check", False, f"Unexpected response: {response.status_code}", {"status_code": response.status_code, "response": response.text})
                return False
                
        except Exception as e:
            self.log_result("Jobdesk Edit Endpoint Check", False, f"Error: {str(e)}")
            return False

    def test_jobdesk_delete_endpoint(self, jobdesk_id, role="super_admin"):
        """Test if jobdesk delete endpoint exists"""
        try:
            headers = self.get_headers(role)
            if not headers:
                self.log_result("Jobdesk Delete Endpoint Check", False, f"No auth token for {role}")
                return False
                
            response = requests.delete(f"{BASE_URL}/jobdesks/{jobdesk_id}", headers=headers)
            
            if response.status_code == 404:
                self.log_result("Jobdesk Delete Endpoint Check", False, "Delete endpoint NOT IMPLEMENTED - returns 404", {"status_code": 404, "response": response.text})
                return False
            elif response.status_code == 200:
                self.log_result("Jobdesk Delete Endpoint Check", True, "Delete endpoint exists and working", {"status_code": 200})
                return True
            elif response.status_code == 403:
                self.log_result("Jobdesk Delete Endpoint Check", True, f"Delete endpoint exists but {role} lacks permission", {"status_code": 403})
                return True
            else:
                self.log_result("Jobdesk Delete Endpoint Check", False, f"Unexpected response: {response.status_code}", {"status_code": response.status_code, "response": response.text})
                return False
                
        except Exception as e:
            self.log_result("Jobdesk Delete Endpoint Check", False, f"Error: {str(e)}")
            return False

    def test_jobdesk_status_update(self, jobdesk_id, role="super_admin"):
        """Test the existing jobdesk status update endpoint"""
        try:
            headers = self.get_headers(role)
            if not headers:
                self.log_result("Jobdesk Status Update", False, f"No auth token for {role}")
                return False
                
            # Test status update (this should work)
            status_data = {"status": "in_progress"}
            response = requests.put(f"{BASE_URL}/jobdesks/{jobdesk_id}/status", headers=headers, json=status_data)
            
            if response.status_code == 200:
                self.log_result("Jobdesk Status Update", True, "Status update endpoint working", {"status_code": 200})
                return True
            else:
                self.log_result("Jobdesk Status Update", False, f"Status update failed: {response.status_code}", {"status_code": response.status_code, "response": response.text})
                return False
                
        except Exception as e:
            self.log_result("Jobdesk Status Update", False, f"Error: {str(e)}")
            return False

    def test_authorization_levels(self, jobdesk_id):
        """Test different authorization levels for jobdesk operations"""
        roles_to_test = ["super_admin", "pengurus", "karyawan"]
        
        for role in roles_to_test:
            print(f"\n--- Testing {role} permissions ---")
            
            # Authenticate
            if not self.authenticate(role):
                continue
                
            # Test edit endpoint
            self.test_jobdesk_edit_endpoint(jobdesk_id, role)
            
            # Test delete endpoint  
            self.test_jobdesk_delete_endpoint(jobdesk_id, role)
            
            # Test status update (should work for all authenticated users)
            self.test_jobdesk_status_update(jobdesk_id, role)

    def run_comprehensive_test(self):
        """Run comprehensive jobdesk edit/delete testing"""
        print("=" * 80)
        print("JOBDESK EDIT AND DELETE FUNCTIONALITY TESTING")
        print("=" * 80)
        print()
        
        # Step 1: Authenticate as super admin
        print("STEP 1: Authentication")
        print("-" * 40)
        if not self.authenticate("super_admin"):
            print("❌ Cannot proceed without authentication")
            return
            
        # Step 2: Get existing jobdesks
        print("\nSTEP 2: Get Existing Jobdesks")
        print("-" * 40)
        jobdesks = self.test_get_jobdesks()
        if not jobdesks or len(jobdesks) == 0:
            print("❌ No jobdesks found for testing")
            return
            
        # Use first jobdesk for testing
        test_jobdesk = jobdesks[0]
        jobdesk_id = test_jobdesk.get('id')
        print(f"Using jobdesk for testing: {test_jobdesk.get('title', 'Unknown')} (ID: {jobdesk_id})")
        
        # Step 3: Test endpoint availability
        print(f"\nSTEP 3: Test Endpoint Availability")
        print("-" * 40)
        edit_exists = self.test_jobdesk_edit_endpoint(jobdesk_id)
        delete_exists = self.test_jobdesk_delete_endpoint(jobdesk_id)
        
        # Step 4: Test authorization levels if endpoints exist
        if edit_exists or delete_exists:
            print(f"\nSTEP 4: Test Authorization Levels")
            print("-" * 40)
            self.test_authorization_levels(jobdesk_id)
        else:
            print(f"\nSTEP 4: Authorization Testing Skipped")
            print("-" * 40)
            print("⚠️  Both edit and delete endpoints are not implemented")
        
        # Step 5: Test existing functionality
        print(f"\nSTEP 5: Test Existing Functionality")
        print("-" * 40)
        self.test_jobdesk_status_update(jobdesk_id)
        
        # Summary
        self.print_summary()

    def print_summary(self):
        """Print test summary"""
        print("\n" + "=" * 80)
        print("TEST SUMMARY")
        print("=" * 80)
        
        total_tests = len(self.test_results)
        passed_tests = len([r for r in self.test_results if "✅ PASS" in r["status"]])
        failed_tests = total_tests - passed_tests
        
        print(f"Total Tests: {total_tests}")
        print(f"Passed: {passed_tests}")
        print(f"Failed: {failed_tests}")
        print()
        
        # Group results by category
        categories = {}
        for result in self.test_results:
            test_name = result["test"]
            if "Authentication" in test_name:
                category = "Authentication"
            elif "Edit" in test_name:
                category = "Edit Functionality"
            elif "Delete" in test_name:
                category = "Delete Functionality"
            elif "Status" in test_name:
                category = "Status Update"
            else:
                category = "Other"
                
            if category not in categories:
                categories[category] = []
            categories[category].append(result)
        
        for category, results in categories.items():
            print(f"{category}:")
            for result in results:
                print(f"  {result['status']}: {result['message']}")
            print()

if __name__ == "__main__":
    tester = JobdeskAPITester()
    tester.run_comprehensive_test()