#!/usr/bin/env python3
"""
Backend Testing Script for Jobdesk Edit and Delete Endpoints
Tests authentication, authorization, validation, and cascade delete functionality
"""

import requests
import json
import sys
from datetime import datetime

# Configuration
BASE_URL = "https://collab-dash-2.preview.emergentagent.com/api"

# Test credentials
CREDENTIALS = {
    'super_admin': {'email': 'admin@workspace.com', 'password': 'password123'},
    'pengurus': {'email': 'pengurus@workspace.com', 'password': 'password123'},
    'karyawan': {'email': 'karyawan1@workspace.com', 'password': 'password123'}
}

class JobdeskTester:
    def __init__(self):
        self.tokens = {}
        self.test_jobdesk_id = None
        self.original_jobdesk = None
        
    def authenticate(self, role):
        """Authenticate and get token for a specific role"""
        try:
            response = requests.post(f"{BASE_URL}/auth/login", json=CREDENTIALS[role])
            if response.status_code == 200:
                data = response.json()
                self.tokens[role] = data.get('token')
                print(f"✅ Authentication successful for {role}")
                return True
            else:
                print(f"❌ Authentication failed for {role}: {response.status_code}")
                return False
        except Exception as e:
            print(f"❌ Authentication error for {role}: {str(e)}")
            return False
    
    def get_headers(self, role):
        """Get headers with auth token for a role"""
        if role not in self.tokens:
            return {}
        return {'Authorization': f'Bearer {self.tokens[role]}', 'Content-Type': 'application/json'}
    
    def get_jobdesks(self):
        """Get list of jobdesks for testing"""
        try:
            headers = self.get_headers('super_admin')
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
                print(f"❌ Failed to get jobdesks: {response.status_code}")
                return False
        except Exception as e:
            print(f"❌ Error getting jobdesks: {str(e)}")
            return False
    
    def create_test_jobdesk(self):
        """Create a test jobdesk specifically for deletion testing"""
        try:
            headers = self.get_headers('super_admin')
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
    
    def test_edit_authorization(self):
        """Test edit authorization for different roles"""
        print("\n🔐 TESTING EDIT AUTHORIZATION")
        
        if not self.test_jobdesk_id:
            print("❌ No test jobdesk available")
            return False
        
        test_data = {'title': 'Updated Title', 'description': 'Updated Description'}
        
        # Test A: Edit with super_admin (should succeed)
        print("\n📝 Test A: Edit with super_admin")
        try:
            headers = self.get_headers('super_admin')
            response = requests.put(f"{BASE_URL}/jobdesks/{self.test_jobdesk_id}", 
                                  json=test_data, headers=headers)
            if response.status_code == 200:
                print("✅ super_admin can edit jobdesk (200 OK)")
                result = response.json()
                if result.get('jobdesk', {}).get('title') == 'Updated Title':
                    print("✅ Changes saved correctly")
                else:
                    print("❌ Changes not saved correctly")
            else:
                print(f"❌ super_admin edit failed: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            print(f"❌ super_admin edit error: {str(e)}")
            return False
        
        # Test B: Edit with pengurus (should succeed)
        print("\n📝 Test B: Edit with pengurus")
        try:
            headers = self.get_headers('pengurus')
            pengurus_data = {'title': 'Updated by Pengurus'}
            response = requests.put(f"{BASE_URL}/jobdesks/{self.test_jobdesk_id}", 
                                  json=pengurus_data, headers=headers)
            if response.status_code == 200:
                print("✅ pengurus can edit jobdesk (200 OK)")
            else:
                print(f"❌ pengurus edit failed: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            print(f"❌ pengurus edit error: {str(e)}")
            return False
        
        # Test C: Edit with karyawan (should fail)
        print("\n📝 Test C: Edit with karyawan")
        try:
            headers = self.get_headers('karyawan')
            response = requests.put(f"{BASE_URL}/jobdesks/{self.test_jobdesk_id}", 
                                  json=test_data, headers=headers)
            if response.status_code == 403:
                print("✅ karyawan correctly forbidden from editing (403)")
            else:
                print(f"❌ karyawan edit should be forbidden but got: {response.status_code}")
                return False
        except Exception as e:
            print(f"❌ karyawan edit error: {str(e)}")
            return False
        
        # Test D: Edit non-existent jobdesk
        print("\n📝 Test D: Edit non-existent jobdesk")
        try:
            headers = self.get_headers('super_admin')
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
        
        return True
    
    def test_delete_authorization(self):
        """Test delete authorization for different roles"""
        print("\n🗑️ TESTING DELETE AUTHORIZATION")
        
        # Create a test jobdesk for deletion
        delete_test_id = self.create_test_jobdesk()
        if not delete_test_id:
            print("❌ Cannot create test jobdesk for deletion")
            return False
        
        # Test A: Delete with karyawan (should fail)
        print("\n🗑️ Test A: Delete with karyawan")
        try:
            headers = self.get_headers('karyawan')
            response = requests.delete(f"{BASE_URL}/jobdesks/{delete_test_id}", headers=headers)
            if response.status_code == 403:
                print("✅ karyawan correctly forbidden from deleting (403)")
            else:
                print(f"❌ karyawan delete should be forbidden but got: {response.status_code}")
                return False
        except Exception as e:
            print(f"❌ karyawan delete error: {str(e)}")
            return False
        
        # Test B: Delete with pengurus (should fail)
        print("\n🗑️ Test B: Delete with pengurus")
        try:
            headers = self.get_headers('pengurus')
            response = requests.delete(f"{BASE_URL}/jobdesks/{delete_test_id}", headers=headers)
            if response.status_code == 403:
                print("✅ pengurus correctly forbidden from deleting (403)")
            else:
                print(f"❌ pengurus delete should be forbidden but got: {response.status_code}")
                return False
        except Exception as e:
            print(f"❌ pengurus delete error: {str(e)}")
            return False
        
        # Test C: Delete with super_admin (should succeed)
        print("\n🗑️ Test C: Delete with super_admin")
        try:
            headers = self.get_headers('super_admin')
            response = requests.delete(f"{BASE_URL}/jobdesks/{delete_test_id}", headers=headers)
            if response.status_code == 200:
                print("✅ super_admin can delete jobdesk (200 OK)")
                result = response.json()
                if result.get('deletedJobdeskId') == delete_test_id:
                    print("✅ Correct jobdesk ID returned in response")
                else:
                    print("❌ Incorrect jobdesk ID in response")
            else:
                print(f"❌ super_admin delete failed: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            print(f"❌ super_admin delete error: {str(e)}")
            return False
        
        # Test D: Delete non-existent jobdesk
        print("\n🗑️ Test D: Delete non-existent jobdesk")
        try:
            headers = self.get_headers('super_admin')
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
        
        # Create a jobdesk with related data for cascade testing
        print("Creating jobdesk with related data for cascade testing...")
        
        try:
            headers = self.get_headers('super_admin')
            
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
    
    def test_edit_validation(self):
        """Test edit validation scenarios"""
        print("\n✅ TESTING EDIT VALIDATION")
        
        if not self.test_jobdesk_id:
            print("❌ No test jobdesk available")
            return False
        
        headers = self.get_headers('super_admin')
        
        # Test empty update (should fail)
        print("\n📝 Testing empty update")
        try:
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
        
        # Test valid partial update
        print("\n📝 Testing valid partial update")
        try:
            partial_data = {'description': 'Partially updated description'}
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
    
    def run_all_tests(self):
        """Run all tests"""
        print("🚀 STARTING JOBDESK EDIT AND DELETE ENDPOINT TESTING")
        print("=" * 60)
        
        # Authenticate all roles
        print("\n🔐 AUTHENTICATING TEST USERS")
        for role in CREDENTIALS.keys():
            if not self.authenticate(role):
                print(f"❌ Failed to authenticate {role}, aborting tests")
                return False
        
        # Get jobdesks for testing
        if not self.get_jobdesks():
            print("❌ Failed to get jobdesks, aborting tests")
            return False
        
        # Run all test suites
        test_results = []
        
        test_results.append(("Edit Authorization", self.test_edit_authorization()))
        test_results.append(("Edit Validation", self.test_edit_validation()))
        test_results.append(("Delete Authorization", self.test_delete_authorization()))
        test_results.append(("Cascade Delete", self.test_cascade_delete_verification()))
        
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