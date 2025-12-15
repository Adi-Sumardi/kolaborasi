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
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://workspaces-2.preview.emergentagent.com')
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
        self.super_admin_token = None
        self.regular_user_token = None
        self.test_user_id = None
        self.mongo_client = None
        self.db = None
        
    def setup(self):
        """Setup test environment"""
        print("🔧 Setting up test environment...")
        
        # Connect to MongoDB
        try:
            self.mongo_client = MongoClient(MONGO_URL)
            self.db = self.mongo_client.get_database()
            print("✅ Connected to MongoDB")
        except Exception as e:
            print(f"❌ Failed to connect to MongoDB: {e}")
            return False
            
        # Get authentication tokens
        if not self._authenticate():
            return False
            
        # Get a test user ID
        if not self._get_test_user():
            return False
            
        return True
        
    def _authenticate(self):
        """Authenticate and get tokens"""
        print("🔐 Authenticating users...")
        
        # Get super admin token
        try:
            response = requests.post(f"{API_BASE}/auth/login", json=SUPER_ADMIN_CREDS)
            if response.status_code == 200:
                self.super_admin_token = response.json().get('token')
                print("✅ Super admin authenticated")
            else:
                print(f"❌ Super admin authentication failed: {response.status_code}")
                return False
        except Exception as e:
            print(f"❌ Super admin authentication error: {e}")
            return False
            
        # Get regular user token
        try:
            response = requests.post(f"{API_BASE}/auth/login", json=REGULAR_USER_CREDS)
            if response.status_code == 200:
                self.regular_user_token = response.json().get('token')
                print("✅ Regular user authenticated")
            else:
                print(f"❌ Regular user authentication failed: {response.status_code}")
                return False
        except Exception as e:
            print(f"❌ Regular user authentication error: {e}")
            return False
            
        return True
        
    def _get_test_user(self):
        """Get a valid user ID for testing"""
        print("👤 Getting test user ID...")
        
        try:
            # Find a user from database
            user = self.db.users.find_one({"email": {"$ne": "admin@workspace.com"}})
            if user:
                self.test_user_id = user['id']
                print(f"✅ Found test user ID: {self.test_user_id}")
                return True
            else:
                print("❌ No test user found in database")
                return False
        except Exception as e:
            print(f"❌ Error getting test user: {e}")
            return False
            
    def test_no_auth_token(self):
        """Test 1: Request without auth token should fail with 403"""
        print("\n🧪 Test 1: No auth token (should fail 403)")
        
        try:
            response = requests.put(
                f"{API_BASE}/users/{self.test_user_id}/password",
                json={"newPassword": "newpass123"}
            )
            
            if response.status_code == 403:
                print("✅ PASS: Correctly rejected unauthorized request (403)")
                return True
            else:
                print(f"❌ FAIL: Expected 403, got {response.status_code}")
                print(f"Response: {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ FAIL: Request error: {e}")
            return False
            
    def test_regular_user_auth(self):
        """Test 2: Regular user should fail with 403"""
        print("\n🧪 Test 2: Regular user auth (should fail 403)")
        
        try:
            headers = {"Authorization": f"Bearer {self.regular_user_token}"}
            response = requests.put(
                f"{API_BASE}/users/{self.test_user_id}/password",
                json={"newPassword": "newpass123"},
                headers=headers
            )
            
            if response.status_code == 403:
                print("✅ PASS: Correctly rejected regular user (403)")
                return True
            else:
                print(f"❌ FAIL: Expected 403, got {response.status_code}")
                print(f"Response: {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ FAIL: Request error: {e}")
            return False
            
    def test_super_admin_auth_success(self):
        """Test 3: Super admin should pass authorization"""
        print("\n🧪 Test 3: Super admin auth (should pass authorization)")
        
        try:
            headers = {"Authorization": f"Bearer {self.super_admin_token}"}
            # Use invalid password to test auth but not validation
            response = requests.put(
                f"{API_BASE}/users/{self.test_user_id}/password",
                json={"newPassword": "123"},  # Too short, should fail validation
                headers=headers
            )
            
            # Should fail validation (400), not authorization (403)
            if response.status_code == 400:
                print("✅ PASS: Super admin passed authorization (failed validation as expected)")
                return True
            elif response.status_code == 403:
                print("❌ FAIL: Super admin failed authorization")
                return False
            else:
                print(f"❌ FAIL: Unexpected status code: {response.status_code}")
                print(f"Response: {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ FAIL: Request error: {e}")
            return False
            
    def test_missing_password(self):
        """Test 4: Missing newPassword field should fail with 400"""
        print("\n🧪 Test 4: Missing newPassword field (should fail 400)")
        
        try:
            headers = {"Authorization": f"Bearer {self.super_admin_token}"}
            response = requests.put(
                f"{API_BASE}/users/{self.test_user_id}/password",
                json={},  # Missing newPassword
                headers=headers
            )
            
            if response.status_code == 400:
                print("✅ PASS: Correctly rejected missing password (400)")
                return True
            else:
                print(f"❌ FAIL: Expected 400, got {response.status_code}")
                print(f"Response: {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ FAIL: Request error: {e}")
            return False
            
    def test_short_password(self):
        """Test 5: Password less than 6 characters should fail with 400"""
        print("\n🧪 Test 5: Short password (should fail 400)")
        
        try:
            headers = {"Authorization": f"Bearer {self.super_admin_token}"}
            response = requests.put(
                f"{API_BASE}/users/{self.test_user_id}/password",
                json={"newPassword": "12345"},  # Only 5 characters
                headers=headers
            )
            
            if response.status_code == 400:
                response_data = response.json()
                if "6 characters" in response_data.get('error', ''):
                    print("✅ PASS: Correctly rejected short password with proper message")
                    return True
                else:
                    print(f"❌ FAIL: Wrong error message: {response_data.get('error')}")
                    return False
            else:
                print(f"❌ FAIL: Expected 400, got {response.status_code}")
                print(f"Response: {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ FAIL: Request error: {e}")
            return False
            
    def test_valid_password_length(self):
        """Test 6: Valid password length should pass validation"""
        print("\n🧪 Test 6: Valid password length (should pass validation)")
        
        try:
            headers = {"Authorization": f"Bearer {self.super_admin_token}"}
            response = requests.put(
                f"{API_BASE}/users/{self.test_user_id}/password",
                json={"newPassword": "validpass123"},  # 12 characters
                headers=headers
            )
            
            # Should succeed (200) since user exists and password is valid
            if response.status_code == 200:
                print("✅ PASS: Valid password accepted")
                return True
            else:
                print(f"❌ FAIL: Expected 200, got {response.status_code}")
                print(f"Response: {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ FAIL: Request error: {e}")
            return False
            
    def test_nonexistent_user(self):
        """Test 7: Non-existent user ID should fail with 404"""
        print("\n🧪 Test 7: Non-existent user (should fail 404)")
        
        try:
            headers = {"Authorization": f"Bearer {self.super_admin_token}"}
            fake_user_id = "nonexistent-user-id-12345"
            response = requests.put(
                f"{API_BASE}/users/{fake_user_id}/password",
                json={"newPassword": "newpass123"},
                headers=headers
            )
            
            if response.status_code == 404:
                print("✅ PASS: Correctly rejected non-existent user (404)")
                return True
            else:
                print(f"❌ FAIL: Expected 404, got {response.status_code}")
                print(f"Response: {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ FAIL: Request error: {e}")
            return False
            
    def test_successful_password_update(self):
        """Test 8: Successful password update and verification"""
        print("\n🧪 Test 8: Successful password update and verification")
        
        new_password = "newpass123"
        
        try:
            # Get original password hash for comparison
            original_user = self.db.users.find_one({"id": self.test_user_id})
            original_password_hash = original_user['password']
            print(f"📝 Original password hash: {original_password_hash[:20]}...")
            
            # Update password
            headers = {"Authorization": f"Bearer {self.super_admin_token}"}
            response = requests.put(
                f"{API_BASE}/users/{self.test_user_id}/password",
                json={"newPassword": new_password},
                headers=headers
            )
            
            if response.status_code != 200:
                print(f"❌ FAIL: Password update failed with {response.status_code}")
                print(f"Response: {response.text}")
                return False
                
            print("✅ Password update API call successful")
            
            # Verify password was updated in database
            updated_user = self.db.users.find_one({"id": self.test_user_id})
            new_password_hash = updated_user['password']
            
            print(f"📝 New password hash: {new_password_hash[:20]}...")
            
            # Check that password hash changed
            if original_password_hash == new_password_hash:
                print("❌ FAIL: Password hash was not updated in database")
                return False
                
            print("✅ Password hash updated in database")
            
            # Verify password is properly hashed (bcrypt format)
            if new_password_hash.startswith('$2a$') or new_password_hash.startswith('$2b$'):
                print("✅ Password is properly hashed with bcrypt")
            else:
                print(f"❌ FAIL: Password not properly hashed. Hash: {new_password_hash}")
                return False
                
            # Verify the hashed password is NOT the plain text
            if new_password_hash == new_password:
                print("❌ FAIL: Password stored as plain text!")
                return False
                
            print("✅ Password is not stored as plain text")
            
            # Verify the new password can be used for login
            login_response = requests.post(
                f"{API_BASE}/auth/login",
                json={
                    "email": updated_user['email'],
                    "password": new_password
                }
            )
            
            if login_response.status_code == 200:
                print("✅ PASS: Can login with new password")
                
                # Restore original password for future tests
                self._restore_original_password(original_password_hash)
                return True
            else:
                print(f"❌ FAIL: Cannot login with new password. Status: {login_response.status_code}")
                print(f"Login response: {login_response.text}")
                
                # Restore original password anyway
                self._restore_original_password(original_password_hash)
                return False
                
        except Exception as e:
            print(f"❌ FAIL: Test error: {e}")
            return False
            
    def _restore_original_password(self, original_hash):
        """Restore original password hash"""
        try:
            self.db.users.update_one(
                {"id": self.test_user_id},
                {"$set": {"password": original_hash}}
            )
            print("🔄 Restored original password for future tests")
        except Exception as e:
            print(f"⚠️ Warning: Could not restore original password: {e}")
            
    def test_password_hashing_verification(self):
        """Test 9: Verify bcrypt hashing is working properly"""
        print("\n🧪 Test 9: Password hashing verification")
        
        test_password = "testpass123"
        
        try:
            # Update password
            headers = {"Authorization": f"Bearer {self.super_admin_token}"}
            response = requests.put(
                f"{API_BASE}/users/{self.test_user_id}/password",
                json={"newPassword": test_password},
                headers=headers
            )
            
            if response.status_code != 200:
                print(f"❌ FAIL: Password update failed: {response.status_code}")
                return False
                
            # Get updated user from database
            user = self.db.users.find_one({"id": self.test_user_id})
            stored_hash = user['password']
            
            print(f"📝 Stored hash: {stored_hash}")
            
            # Verify hash format
            if not (stored_hash.startswith('$2a$') or stored_hash.startswith('$2b$')):
                print(f"❌ FAIL: Hash doesn't have bcrypt format: {stored_hash}")
                return False
                
            print("✅ Hash has correct bcrypt format")
            
            # Verify hash can be verified with bcrypt
            if bcrypt.checkpw(test_password.encode('utf-8'), stored_hash.encode('utf-8')):
                print("✅ PASS: Bcrypt verification successful")
                return True
            else:
                print("❌ FAIL: Bcrypt verification failed")
                return False
                
        except Exception as e:
            print(f"❌ FAIL: Hashing verification error: {e}")
            return False
            
    def run_all_tests(self):
        """Run all test scenarios"""
        print("🚀 Starting Update User Password API Tests")
        print("=" * 60)
        
        if not self.setup():
            print("❌ Setup failed. Cannot proceed with tests.")
            return False
            
        tests = [
            ("Authentication & Authorization Tests", [
                self.test_no_auth_token,
                self.test_regular_user_auth, 
                self.test_super_admin_auth_success
            ]),
            ("Validation Tests", [
                self.test_missing_password,
                self.test_short_password,
                self.test_valid_password_length
            ]),
            ("User Existence Tests", [
                self.test_nonexistent_user
            ]),
            ("Success & Verification Tests", [
                self.test_successful_password_update,
                self.test_password_hashing_verification
            ])
        ]
        
        total_tests = 0
        passed_tests = 0
        
        for category, test_functions in tests:
            print(f"\n📋 {category}")
            print("-" * 40)
            
            for test_func in test_functions:
                total_tests += 1
                if test_func():
                    passed_tests += 1
                    
        # Final results
        print("\n" + "=" * 60)
        print("🏁 TEST RESULTS SUMMARY")
        print("=" * 60)
        print(f"Total Tests: {total_tests}")
        print(f"Passed: {passed_tests}")
        print(f"Failed: {total_tests - passed_tests}")
        
        if passed_tests == total_tests:
            print("🎉 ALL TESTS PASSED!")
            return True
        else:
            print(f"❌ {total_tests - passed_tests} TESTS FAILED")
            return False
            
    def cleanup(self):
        """Cleanup resources"""
        if self.mongo_client:
            self.mongo_client.close()
            print("🧹 Cleaned up MongoDB connection")

if __name__ == "__main__":
    tester = PasswordUpdateTester()
    try:
        success = tester.run_all_tests()
        sys.exit(0 if success else 1)
    finally:
        tester.cleanup()