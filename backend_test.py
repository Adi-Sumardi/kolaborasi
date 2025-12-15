#!/usr/bin/env python3
"""
Backend Testing Script for Jobdesk Edit and Delete Endpoints
Tests authentication, authorization, validation, and cascade delete functionality
"""

import requests
import json
import sys
import time
from datetime import datetime

# Configuration
BASE_URL = "https://task-central-38.preview.emergentagent.com/api"

class JobdeskTester:
    def __init__(self):
        self.admin_token = None
        self.test_jobdesk_id = None
        self.original_jobdesk = None
        
    def authenticate_admin(self):
        """Authenticate as super_admin"""
        try:
            response = requests.post(f"{BASE_URL}/auth/login", 
                                   json={'email': 'admin@workspace.com', 'password': 'password123'})
            if response.status_code == 200:
                data = response.json()
                self.admin_token = data.get('token')
                print("✅ Authentication successful for super_admin")
                return True
            else:
                print(f"❌ Authentication failed for super_admin: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            print(f"❌ Authentication error for super_admin: {str(e)}")
            return False
    
    def get_admin_headers(self):
        """Get headers with admin auth token"""
        return {'Authorization': f'Bearer {self.admin_token}', 'Content-Type': 'application/json'}
    
    def get_jobdesks(self):
        """Get list of jobdesks for testing"""
        try:
            headers = self.get_admin_headers()
            response = requests.get(f"{BASE_URL}/jobdesks", headers=headers)
            if response.status_code == 200:
                jobdesks = response.json()
                if jobdesks:
                    # Use the first jobdesk for edit testing
                    self.test_jobdesk_id = jobdesks[0]['id']
                    self.original_jobdesk = jobdesks[0].copy()
                    print(f"✅ Retrieved {len(jobdesks)} jobdesks, using {self.test_jobdesk_id} for testing")
                    return True
                else:
                    print("❌ No jobdesks found for testing")
                    return False
            else:
                print(f"❌ Failed to get jobdesks: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            print(f"❌ Error getting jobdesks: {str(e)}")
            return False
    
    def create_test_jobdesk(self):
        """Create a test jobdesk specifically for deletion testing"""
        try:
            headers = self.get_admin_headers()
            test_data = {
                'title': 'TEST JOBDESK FOR DELETION',
                'description': 'This jobdesk will be deleted during testing',
                'priority': 'medium',
                'dueDate': '2024-12-31T23:59:59.000Z',
                'assignedTo': []
            }
            
            response = requests.post(f"{BASE_URL}/jobdesks", json=test_data, headers=headers)
            if response.status_code == 201:
                jobdesk = response.json().get('jobdesk')
                print(f"✅ Created test jobdesk for deletion: {jobdesk['id']}")
                return jobdesk['id']
            else:
                print(f"❌ Failed to create test jobdesk: {response.status_code} - {response.text}")
                return None
        except Exception as e:
            print(f"❌ Error creating test jobdesk: {str(e)}")
            return None
    
    def test_edit_functionality(self):
        """Test edit functionality with super_admin"""
        print("\n🔐 TESTING EDIT FUNCTIONALITY")
        
        if not self.test_jobdesk_id:
            print("❌ No test jobdesk available")
            return False
        
        # Test A: Basic edit with super_admin (should succeed)
        print("\n📝 Test A: Basic edit with super_admin")
        try:
            headers = self.get_admin_headers()
            test_data = {'title': 'Updated Title by Admin', 'description': 'Updated Description'}
            response = requests.put(f"{BASE_URL}/jobdesks/{self.test_jobdesk_id}", 
                                  json=test_data, headers=headers)
            if response.status_code == 200:
                print("✅ super_admin can edit jobdesk (200 OK)")
                result = response.json()
                if result.get('jobdesk', {}).get('title') == 'Updated Title by Admin':
                    print("✅ Changes saved correctly")
                else:
                    print("❌ Changes not saved correctly")
                    print(f"Expected: 'Updated Title by Admin', Got: {result.get('jobdesk', {}).get('title')}")
            else:
                print(f"❌ super_admin edit failed: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            print(f"❌ super_admin edit error: {str(e)}")
            return False
        
        # Test B: Edit non-existent jobdesk (should return 404)
        print("\n📝 Test B: Edit non-existent jobdesk")
        try:
            headers = self.get_admin_headers()
            test_data = {'title': 'Should not work'}
            response = requests.put(f"{BASE_URL}/jobdesks/fake-id-12345", 
                                  json=test_data, headers=headers)
            if response.status_code == 404:
                print("✅ Non-existent jobdesk correctly returns 404")
            else:
                print(f"❌ Non-existent jobdesk should return 404 but got: {response.status_code}")
                return False
        except Exception as e:
            print(f"❌ Non-existent jobdesk edit error: {str(e)}")
            return False
        
        # Test C: Empty update (should fail with 400)
        print("\n📝 Test C: Empty update validation")
        try:
            headers = self.get_admin_headers()
            response = requests.put(f"{BASE_URL}/jobdesks/{self.test_jobdesk_id}", 
                                  json={}, headers=headers)
            if response.status_code == 400:
                print("✅ Empty update correctly rejected (400)")
            else:
                print(f"❌ Empty update should be rejected but got: {response.status_code}")
                return False
        except Exception as e:
            print(f"❌ Empty update test error: {str(e)}")
            return False
        
        # Test D: Partial update (should succeed)
        print("\n📝 Test D: Partial update")
        try:
            headers = self.get_admin_headers()
            partial_data = {'description': 'Only description updated'}
            response = requests.put(f"{BASE_URL}/jobdesks/{self.test_jobdesk_id}", 
                                  json=partial_data, headers=headers)
            if response.status_code == 200:
                print("✅ Partial update successful (200 OK)")
            else:
                print(f"❌ Partial update failed: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            print(f"❌ Partial update test error: {str(e)}")
            return False
        
        return True
    
    def test_delete_functionality(self):
        """Test delete functionality"""
        print("\n🗑️ TESTING DELETE FUNCTIONALITY")
        
        # Create a test jobdesk for deletion
        delete_test_id = self.create_test_jobdesk()
        if not delete_test_id:
            print("❌ Cannot create test jobdesk for deletion")
            return False
        
        # Test A: Delete with super_admin (should succeed)
        print("\n🗑️ Test A: Delete with super_admin")
        try:
            headers = self.get_admin_headers()
            response = requests.delete(f"{BASE_URL}/jobdesks/{delete_test_id}", headers=headers)
            if response.status_code == 200:
                print("✅ super_admin can delete jobdesk (200 OK)")
                result = response.json()
                if result.get('deletedJobdeskId') == delete_test_id:
                    print("✅ Correct jobdesk ID returned in response")
                else:
                    print("❌ Incorrect jobdesk ID in response")
                    print(f"Expected: {delete_test_id}, Got: {result.get('deletedJobdeskId')}")
            else:
                print(f"❌ super_admin delete failed: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            print(f"❌ super_admin delete error: {str(e)}")
            return False
        
        # Test B: Delete non-existent jobdesk (should return 404)
        print("\n🗑️ Test B: Delete non-existent jobdesk")
        try:
            headers = self.get_admin_headers()
            response = requests.delete(f"{BASE_URL}/jobdesks/fake-id-12345", headers=headers)
            if response.status_code == 404:
                print("✅ Non-existent jobdesk correctly returns 404")
            else:
                print(f"❌ Non-existent jobdesk should return 404 but got: {response.status_code}")
                return False
        except Exception as e:
            print(f"❌ Non-existent jobdesk delete error: {str(e)}")
            return False
        
        return True
    
    def test_cascade_delete_verification(self):
        """Test cascade delete behavior"""
        print("\n🔗 TESTING CASCADE DELETE VERIFICATION")
        
        try:
            headers = self.get_admin_headers()
            
            # Create test jobdesk
            jobdesk_data = {
                'title': 'CASCADE DELETE TEST',
                'description': 'Testing cascade delete functionality',
                'priority': 'high',
                'assignedTo': []
            }
            
            response = requests.post(f"{BASE_URL}/jobdesks", json=jobdesk_data, headers=headers)
            if response.status_code != 201:
                print(f"❌ Failed to create cascade test jobdesk: {response.status_code}")
                return False
            
            cascade_jobdesk_id = response.json().get('jobdesk', {}).get('id')
            print(f"✅ Created cascade test jobdesk: {cascade_jobdesk_id}")
            
            # Delete the jobdesk and verify cascade behavior
            print("Deleting jobdesk to test cascade behavior...")
            response = requests.delete(f"{BASE_URL}/jobdesks/{cascade_jobdesk_id}", headers=headers)
            
            if response.status_code == 200:
                print("✅ Cascade delete successful (200 OK)")
                
                # Verify jobdesk is deleted
                response = requests.get(f"{BASE_URL}/jobdesks", headers=headers)
                if response.status_code == 200:
                    jobdesks = response.json()
                    deleted_exists = any(j['id'] == cascade_jobdesk_id for j in jobdesks)
                    if not deleted_exists:
                        print("✅ Jobdesk successfully removed from database")
                    else:
                        print("❌ Jobdesk still exists in database after deletion")
                        return False
                else:
                    print("❌ Could not verify jobdesk deletion")
                    return False
                
            else:
                print(f"❌ Cascade delete failed: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ Cascade delete test error: {str(e)}")
            return False
        
        return True
    
    def test_unauthorized_access(self):
        """Test unauthorized access scenarios"""
        print("\n🚫 TESTING UNAUTHORIZED ACCESS")
        
        if not self.test_jobdesk_id:
            print("❌ No test jobdesk available")
            return False
        
        # Test A: Edit without auth token (should return 403)
        print("\n🚫 Test A: Edit without auth token")
        try:
            headers = {'Content-Type': 'application/json'}
            test_data = {'title': 'Should not work'}
            response = requests.put(f"{BASE_URL}/jobdesks/{self.test_jobdesk_id}", 
                                  json=test_data, headers=headers)
            if response.status_code == 403:
                print("✅ Unauthorized edit correctly rejected (403)")
            else:
                print(f"❌ Unauthorized edit should return 403 but got: {response.status_code}")
                return False
        except Exception as e:
            print(f"❌ Unauthorized edit test error: {str(e)}")
            return False
        
        # Test B: Delete without auth token (should return 403)
        print("\n🚫 Test B: Delete without auth token")
        try:
            headers = {'Content-Type': 'application/json'}
            response = requests.delete(f"{BASE_URL}/jobdesks/{self.test_jobdesk_id}", headers=headers)
            if response.status_code == 403:
                print("✅ Unauthorized delete correctly rejected (403)")
            else:
                print(f"❌ Unauthorized delete should return 403 but got: {response.status_code}")
                return False
        except Exception as e:
            print(f"❌ Unauthorized delete test error: {str(e)}")
            return False
        
        return True
    
    def run_all_tests(self):
        """Run all tests"""
        print("🚀 STARTING JOBDESK EDIT AND DELETE ENDPOINT TESTING")
        print("=" * 60)
        
        # Authenticate admin
        print("\n🔐 AUTHENTICATING SUPER ADMIN")
        if not self.authenticate_admin():
            print("❌ Failed to authenticate super_admin, aborting tests")
            return False
        
        # Get jobdesks for testing
        if not self.get_jobdesks():
            print("❌ Failed to get jobdesks, aborting tests")
            return False
        
        # Run all test suites
        test_results = []
        
        test_results.append(("Edit Functionality", self.test_edit_functionality()))
        test_results.append(("Delete Functionality", self.test_delete_functionality()))
        test_results.append(("Cascade Delete", self.test_cascade_delete_verification()))
        test_results.append(("Unauthorized Access", self.test_unauthorized_access()))
        
        # Print summary
        print("\n" + "=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        
        passed = 0
        total = len(test_results)
        
        for test_name, result in test_results:
            status = "✅ PASSED" if result else "❌ FAILED"
            print(f"{test_name}: {status}")
            if result:
                passed += 1
        
        print(f"\nOverall: {passed}/{total} tests passed")
        
        if passed == total:
            print("🎉 ALL TESTS PASSED - Jobdesk Edit and Delete endpoints are working correctly!")
            return True
        else:
            print("⚠️ SOME TESTS FAILED - Check the detailed output above")
            return False

if __name__ == "__main__":
    tester = JobdeskTester()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)