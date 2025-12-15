#!/usr/bin/env python3
"""
PWA Backend Endpoints Testing Script
Tests the PWA implementation backend endpoints for push notifications and offline functionality.
"""

import requests
import json
import sys
from datetime import datetime

# Configuration
BASE_URL = "https://workspaces-2.preview.emergentagent.com/api"
CREDENTIALS = {
    "super_admin": {"email": "admin@workspace.com", "password": "password123"},
    "employee": {"email": "karyawan1@workspace.com", "password": "password123"}
}

class PWABackendTester:
    def __init__(self):
        self.session = requests.Session()
        self.tokens = {}
        self.test_results = []
        
    def log_test(self, test_name, success, message, details=None):
        """Log test result"""
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}: {message}")
        if details:
            print(f"   Details: {details}")
        
        self.test_results.append({
            "test": test_name,
            "success": success,
            "message": message,
            "details": details
        })
    
    def login(self, role):
        """Login and get JWT token"""
        try:
            creds = CREDENTIALS[role]
            response = self.session.post(
                f"{BASE_URL}/auth/login",
                json=creds,
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code == 200:
                data = response.json()
                token = data.get("token")
                if token:
                    self.tokens[role] = token
                    self.log_test(f"Login {role}", True, f"Successfully logged in as {creds['email']}")
                    return token
                else:
                    self.log_test(f"Login {role}", False, "No token in response", data)
                    return None
            else:
                self.log_test(f"Login {role}", False, f"Login failed with status {response.status_code}", response.text)
                return None
                
        except Exception as e:
            self.log_test(f"Login {role}", False, f"Login exception: {str(e)}")
            return None
    
    def test_vapid_key_endpoint(self):
        """Test GET /api/pwa/vapid-key - Should work without authentication"""
        try:
            response = self.session.get(f"{BASE_URL}/pwa/vapid-key")
            
            if response.status_code == 200:
                data = response.json()
                if "publicKey" in data and data["publicKey"]:
                    self.log_test(
                        "VAPID Key Endpoint", 
                        True, 
                        "Successfully retrieved VAPID public key",
                        f"Key length: {len(data['publicKey'])} chars"
                    )
                    return data["publicKey"]
                else:
                    self.log_test(
                        "VAPID Key Endpoint", 
                        False, 
                        "Response missing publicKey field", 
                        data
                    )
                    return None
            else:
                self.log_test(
                    "VAPID Key Endpoint", 
                    False, 
                    f"Failed with status {response.status_code}", 
                    response.text
                )
                return None
                
        except Exception as e:
            self.log_test("VAPID Key Endpoint", False, f"Exception: {str(e)}")
            return None
    
    def test_save_subscription_unauthorized(self):
        """Test POST /api/pwa/save-subscription without auth - Should return 403"""
        try:
            test_subscription = {
                "subscription": {
                    "endpoint": "https://fcm.googleapis.com/fcm/send/test-endpoint",
                    "keys": {
                        "p256dh": "test-p256dh-key",
                        "auth": "test-auth-key"
                    }
                }
            }
            
            response = self.session.post(
                f"{BASE_URL}/pwa/save-subscription",
                json=test_subscription,
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code == 403:
                self.log_test(
                    "Save Subscription (No Auth)", 
                    True, 
                    "Correctly rejected unauthorized request"
                )
            else:
                self.log_test(
                    "Save Subscription (No Auth)", 
                    False, 
                    f"Expected 403, got {response.status_code}", 
                    response.text
                )
                
        except Exception as e:
            self.log_test("Save Subscription (No Auth)", False, f"Exception: {str(e)}")
    
    def test_save_subscription_authorized(self, token):
        """Test POST /api/pwa/save-subscription with auth - Should succeed"""
        try:
            test_subscription = {
                "subscription": {
                    "endpoint": "https://fcm.googleapis.com/fcm/send/test-endpoint-auth",
                    "keys": {
                        "p256dh": "test-p256dh-key-auth",
                        "auth": "test-auth-key-auth"
                    }
                }
            }
            
            response = self.session.post(
                f"{BASE_URL}/pwa/save-subscription",
                json=test_subscription,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {token}"
                }
            )
            
            if response.status_code == 200:
                data = response.json()
                if data.get("subscribed") == True:
                    self.log_test(
                        "Save Subscription (Authorized)", 
                        True, 
                        "Successfully saved push subscription",
                        data.get("message")
                    )
                    return test_subscription["subscription"]["endpoint"]
                else:
                    self.log_test(
                        "Save Subscription (Authorized)", 
                        False, 
                        "Unexpected response format", 
                        data
                    )
                    return None
            else:
                self.log_test(
                    "Save Subscription (Authorized)", 
                    False, 
                    f"Failed with status {response.status_code}", 
                    response.text
                )
                return None
                
        except Exception as e:
            self.log_test("Save Subscription (Authorized)", False, f"Exception: {str(e)}")
            return None
    
    def test_save_subscription_invalid_data(self, token):
        """Test POST /api/pwa/save-subscription with invalid data - Should return 400"""
        try:
            invalid_subscription = {
                "subscription": {
                    # Missing endpoint
                    "keys": {
                        "p256dh": "test-p256dh-key",
                        "auth": "test-auth-key"
                    }
                }
            }
            
            response = self.session.post(
                f"{BASE_URL}/pwa/save-subscription",
                json=invalid_subscription,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {token}"
                }
            )
            
            if response.status_code == 400:
                self.log_test(
                    "Save Subscription (Invalid Data)", 
                    True, 
                    "Correctly rejected invalid subscription data"
                )
            else:
                self.log_test(
                    "Save Subscription (Invalid Data)", 
                    False, 
                    f"Expected 400, got {response.status_code}", 
                    response.text
                )
                
        except Exception as e:
            self.log_test("Save Subscription (Invalid Data)", False, f"Exception: {str(e)}")
    
    def test_remove_subscription_unauthorized(self):
        """Test POST /api/pwa/remove-subscription without auth - Should return 403"""
        try:
            remove_data = {
                "endpoint": "https://fcm.googleapis.com/fcm/send/test-endpoint"
            }
            
            response = self.session.post(
                f"{BASE_URL}/pwa/remove-subscription",
                json=remove_data,
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code == 403:
                self.log_test(
                    "Remove Subscription (No Auth)", 
                    True, 
                    "Correctly rejected unauthorized request"
                )
            else:
                self.log_test(
                    "Remove Subscription (No Auth)", 
                    False, 
                    f"Expected 403, got {response.status_code}", 
                    response.text
                )
                
        except Exception as e:
            self.log_test("Remove Subscription (No Auth)", False, f"Exception: {str(e)}")
    
    def test_remove_subscription_authorized(self, token, endpoint):
        """Test POST /api/pwa/remove-subscription with auth - Should succeed"""
        try:
            remove_data = {
                "endpoint": endpoint
            }
            
            response = self.session.post(
                f"{BASE_URL}/pwa/remove-subscription",
                json=remove_data,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {token}"
                }
            )
            
            if response.status_code == 200:
                data = response.json()
                if data.get("subscribed") == False:
                    self.log_test(
                        "Remove Subscription (Authorized)", 
                        True, 
                        "Successfully removed push subscription",
                        data.get("message")
                    )
                else:
                    self.log_test(
                        "Remove Subscription (Authorized)", 
                        False, 
                        "Unexpected response format", 
                        data
                    )
            else:
                self.log_test(
                    "Remove Subscription (Authorized)", 
                    False, 
                    f"Failed with status {response.status_code}", 
                    response.text
                )
                
        except Exception as e:
            self.log_test("Remove Subscription (Authorized)", False, f"Exception: {str(e)}")
    
    def test_remove_subscription_missing_endpoint(self, token):
        """Test POST /api/pwa/remove-subscription without endpoint - Should return 400"""
        try:
            remove_data = {}  # Missing endpoint
            
            response = self.session.post(
                f"{BASE_URL}/pwa/remove-subscription",
                json=remove_data,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {token}"
                }
            )
            
            if response.status_code == 400:
                self.log_test(
                    "Remove Subscription (Missing Endpoint)", 
                    True, 
                    "Correctly rejected request without endpoint"
                )
            else:
                self.log_test(
                    "Remove Subscription (Missing Endpoint)", 
                    False, 
                    f"Expected 400, got {response.status_code}", 
                    response.text
                )
                
        except Exception as e:
            self.log_test("Remove Subscription (Missing Endpoint)", False, f"Exception: {str(e)}")
    
    def test_offline_bundle_unauthorized(self):
        """Test GET /api/pwa/offline-bundle without auth - Should return 403"""
        try:
            response = self.session.get(f"{BASE_URL}/pwa/offline-bundle")
            
            if response.status_code == 403:
                self.log_test(
                    "Offline Bundle (No Auth)", 
                    True, 
                    "Correctly rejected unauthorized request"
                )
            else:
                self.log_test(
                    "Offline Bundle (No Auth)", 
                    False, 
                    f"Expected 403, got {response.status_code}", 
                    response.text
                )
                
        except Exception as e:
            self.log_test("Offline Bundle (No Auth)", False, f"Exception: {str(e)}")
    
    def test_offline_bundle_authorized(self, token):
        """Test GET /api/pwa/offline-bundle with auth - Should return data bundle"""
        try:
            response = self.session.get(
                f"{BASE_URL}/pwa/offline-bundle",
                headers={"Authorization": f"Bearer {token}"}
            )
            
            if response.status_code == 200:
                data = response.json()
                expected_fields = ["jobdesks", "chatMessages", "attachments", "users", "timestamp"]
                
                missing_fields = [field for field in expected_fields if field not in data]
                
                if not missing_fields:
                    self.log_test(
                        "Offline Bundle (Authorized)", 
                        True, 
                        "Successfully retrieved offline data bundle",
                        f"Contains: {', '.join(expected_fields)}"
                    )
                else:
                    self.log_test(
                        "Offline Bundle (Authorized)", 
                        False, 
                        f"Missing fields: {missing_fields}", 
                        f"Available fields: {list(data.keys())}"
                    )
            else:
                self.log_test(
                    "Offline Bundle (Authorized)", 
                    False, 
                    f"Failed with status {response.status_code}", 
                    response.text
                )
                
        except Exception as e:
            self.log_test("Offline Bundle (Authorized)", False, f"Exception: {str(e)}")
    
    def run_all_tests(self):
        """Run all PWA backend tests"""
        print("=" * 80)
        print("PWA BACKEND ENDPOINTS TESTING")
        print("=" * 80)
        print(f"Base URL: {BASE_URL}")
        print(f"Test Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print()
        
        # Test 1: VAPID Key (no auth required)
        print("🔑 Testing VAPID Key Endpoint...")
        vapid_key = self.test_vapid_key_endpoint()
        print()
        
        # Test 2: Authentication
        print("🔐 Testing Authentication...")
        admin_token = self.login("super_admin")
        employee_token = self.login("employee")
        print()
        
        if not admin_token:
            print("❌ Cannot proceed without admin token")
            return
        
        # Test 3: Save Subscription Tests
        print("💾 Testing Save Subscription Endpoint...")
        self.test_save_subscription_unauthorized()
        saved_endpoint = self.test_save_subscription_authorized(admin_token)
        self.test_save_subscription_invalid_data(admin_token)
        print()
        
        # Test 4: Remove Subscription Tests
        print("🗑️ Testing Remove Subscription Endpoint...")
        self.test_remove_subscription_unauthorized()
        if saved_endpoint:
            self.test_remove_subscription_authorized(admin_token, saved_endpoint)
        self.test_remove_subscription_missing_endpoint(admin_token)
        print()
        
        # Test 5: Offline Bundle Tests
        print("📦 Testing Offline Bundle Endpoint...")
        self.test_offline_bundle_unauthorized()
        self.test_offline_bundle_authorized(admin_token)
        print()
        
        # Test Summary
        self.print_summary()
    
    def print_summary(self):
        """Print test summary"""
        print("=" * 80)
        print("TEST SUMMARY")
        print("=" * 80)
        
        total_tests = len(self.test_results)
        passed_tests = sum(1 for result in self.test_results if result["success"])
        failed_tests = total_tests - passed_tests
        
        print(f"Total Tests: {total_tests}")
        print(f"Passed: {passed_tests} ✅")
        print(f"Failed: {failed_tests} ❌")
        print(f"Success Rate: {(passed_tests/total_tests)*100:.1f}%")
        print()
        
        if failed_tests > 0:
            print("FAILED TESTS:")
            for result in self.test_results:
                if not result["success"]:
                    print(f"❌ {result['test']}: {result['message']}")
                    if result["details"]:
                        print(f"   Details: {result['details']}")
            print()
        
        print("ENDPOINT STATUS:")
        endpoints = {
            "GET /api/pwa/vapid-key": any(r["test"] == "VAPID Key Endpoint" and r["success"] for r in self.test_results),
            "POST /api/pwa/save-subscription": any(r["test"] == "Save Subscription (Authorized)" and r["success"] for r in self.test_results),
            "POST /api/pwa/remove-subscription": any(r["test"] == "Remove Subscription (Authorized)" and r["success"] for r in self.test_results),
            "GET /api/pwa/offline-bundle": any(r["test"] == "Offline Bundle (Authorized)" and r["success"] for r in self.test_results)
        }
        
        for endpoint, status in endpoints.items():
            status_icon = "✅" if status else "❌"
            print(f"{status_icon} {endpoint}")
        
        print("=" * 80)

if __name__ == "__main__":
    tester = PWABackendTester()
    tester.run_all_tests()