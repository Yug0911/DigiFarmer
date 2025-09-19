#!/usr/bin/env python3
"""
DigiFarmer Backend API Testing Suite
Tests all backend endpoints comprehensively
"""

import requests
import json
import time
import uuid
from datetime import datetime
from typing import Dict, Any, List

# Configuration
BASE_URL = "https://digifarmer.preview.emergentagent.com/api"
TIMEOUT = 30

class DigiFarmerAPITester:
    def __init__(self):
        self.session = requests.Session()
        self.session.timeout = TIMEOUT
        self.test_results = []
        self.session_id = str(uuid.uuid4())
        
    def log_test(self, test_name: str, success: bool, details: str = "", response_data: Any = None):
        """Log test results"""
        result = {
            "test": test_name,
            "success": success,
            "details": details,
            "timestamp": datetime.now().isoformat(),
            "response_data": response_data
        }
        self.test_results.append(result)
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} - {test_name}: {details}")
        
    def test_api_health(self):
        """Test basic API connectivity and health"""
        print("\n=== Testing API Health ===")
        
        try:
            response = self.session.get(f"{BASE_URL}/")
            if response.status_code == 200:
                data = response.json()
                if "DigiFarmer API" in data.get("message", ""):
                    self.log_test("API Health Check", True, "API is responding correctly")
                else:
                    self.log_test("API Health Check", False, f"Unexpected response: {data}")
            else:
                self.log_test("API Health Check", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("API Health Check", False, f"Connection error: {str(e)}")
    
    def test_status_endpoints(self):
        """Test status check endpoints"""
        print("\n=== Testing Status Endpoints ===")
        
        # Test POST /status
        try:
            status_data = {"client_name": "DigiFarmer_Test_Client"}
            response = self.session.post(f"{BASE_URL}/status", json=status_data)
            
            if response.status_code == 200:
                data = response.json()
                if "id" in data and "client_name" in data:
                    self.log_test("Create Status Check", True, "Status check created successfully")
                else:
                    self.log_test("Create Status Check", False, f"Missing fields in response: {data}")
            else:
                self.log_test("Create Status Check", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("Create Status Check", False, f"Error: {str(e)}")
        
        # Test GET /status
        try:
            response = self.session.get(f"{BASE_URL}/status")
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    self.log_test("Get Status Checks", True, f"Retrieved {len(data)} status checks")
                else:
                    self.log_test("Get Status Checks", False, f"Expected list, got: {type(data)}")
            else:
                self.log_test("Get Status Checks", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("Get Status Checks", False, f"Error: {str(e)}")
    
    def test_ai_chat_integration(self):
        """Test AI Chat Integration with agricultural prompts"""
        print("\n=== Testing AI Chat Integration ===")
        
        # Test agricultural question
        agricultural_questions = [
            "What crops should I grow in Punjab during Kharif season?",
            "My wheat crop has yellow spots on leaves. What could be the problem?",
            "What is the best fertilizer for rice cultivation in monsoon season?"
        ]
        
        for question in agricultural_questions:
            try:
                chat_data = {
                    "message": question,
                    "session_id": self.session_id,
                    "message_type": "text"
                }
                
                response = self.session.post(f"{BASE_URL}/chat", json=chat_data)
                
                if response.status_code == 200:
                    data = response.json()
                    if "response" in data and "session_id" in data and "message_id" in data:
                        # Check if response contains agricultural advice
                        ai_response = data["response"].lower()
                        agricultural_keywords = ["crop", "soil", "fertilizer", "season", "plant", "farm", "agriculture"]
                        has_agricultural_content = any(keyword in ai_response for keyword in agricultural_keywords)
                        
                        if has_agricultural_content and len(data["response"]) > 50:
                            self.log_test(f"AI Chat - {question[:30]}...", True, 
                                        f"Got relevant agricultural advice ({len(data['response'])} chars)")
                        else:
                            self.log_test(f"AI Chat - {question[:30]}...", False, 
                                        f"Response lacks agricultural content or too short: {data['response'][:100]}")
                    else:
                        self.log_test(f"AI Chat - {question[:30]}...", False, f"Missing fields in response: {data}")
                else:
                    self.log_test(f"AI Chat - {question[:30]}...", False, f"HTTP {response.status_code}: {response.text}")
                    
                # Small delay between requests
                time.sleep(1)
                
            except Exception as e:
                self.log_test(f"AI Chat - {question[:30]}...", False, f"Error: {str(e)}")
    
    def test_chat_history(self):
        """Test chat history retrieval"""
        print("\n=== Testing Chat History ===")
        
        try:
            response = self.session.get(f"{BASE_URL}/chat/{self.session_id}")
            
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    if len(data) > 0:
                        # Check if messages have required fields
                        first_message = data[0]
                        required_fields = ["id", "session_id", "message", "response", "timestamp"]
                        has_all_fields = all(field in first_message for field in required_fields)
                        
                        if has_all_fields:
                            self.log_test("Chat History Retrieval", True, 
                                        f"Retrieved {len(data)} messages with all required fields")
                        else:
                            missing_fields = [field for field in required_fields if field not in first_message]
                            self.log_test("Chat History Retrieval", False, 
                                        f"Missing fields in messages: {missing_fields}")
                    else:
                        self.log_test("Chat History Retrieval", True, "No messages in history (expected for new session)")
                else:
                    self.log_test("Chat History Retrieval", False, f"Expected list, got: {type(data)}")
            else:
                self.log_test("Chat History Retrieval", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("Chat History Retrieval", False, f"Error: {str(e)}")
    
    def test_crop_recommendation_system(self):
        """Test crop recommendation with different soil/climate parameters"""
        print("\n=== Testing Crop Recommendation System ===")
        
        test_scenarios = [
            {
                "location": "Punjab, India",
                "soil_type": "Alluvial",
                "ph_level": 7.2,
                "moisture_level": "High"
            },
            {
                "location": "Maharashtra, India", 
                "soil_type": "Black Cotton",
                "ph_level": 6.8,
                "moisture_level": "Medium"
            },
            {
                "location": "Tamil Nadu, India",
                "soil_type": "Red Laterite",
                "ph_level": 5.5,
                "moisture_level": "Low"
            }
        ]
        
        for i, scenario in enumerate(test_scenarios):
            try:
                response = self.session.post(f"{BASE_URL}/crops/recommend", params=scenario)
                
                if response.status_code == 200:
                    data = response.json()
                    if "recommendation" in data and "ai_advice" in data:
                        recommendation = data["recommendation"]
                        required_fields = ["location", "soil_type", "ph_level", "moisture_level", 
                                         "recommended_crops", "confidence_score"]
                        
                        has_all_fields = all(field in recommendation for field in required_fields)
                        has_crops = len(recommendation.get("recommended_crops", [])) > 0
                        has_advice = len(data.get("ai_advice", "")) > 100
                        
                        if has_all_fields and has_crops and has_advice:
                            crops = ", ".join(recommendation["recommended_crops"])
                            self.log_test(f"Crop Recommendation Scenario {i+1}", True, 
                                        f"Got recommendations: {crops} (confidence: {recommendation['confidence_score']})")
                        else:
                            issues = []
                            if not has_all_fields:
                                issues.append("missing fields")
                            if not has_crops:
                                issues.append("no crop recommendations")
                            if not has_advice:
                                issues.append("insufficient AI advice")
                            self.log_test(f"Crop Recommendation Scenario {i+1}", False, 
                                        f"Issues: {', '.join(issues)}")
                    else:
                        self.log_test(f"Crop Recommendation Scenario {i+1}", False, 
                                    f"Missing recommendation or ai_advice in response: {data}")
                else:
                    self.log_test(f"Crop Recommendation Scenario {i+1}", False, 
                                f"HTTP {response.status_code}: {response.text}")
                    
                time.sleep(1)  # Delay between requests
                
            except Exception as e:
                self.log_test(f"Crop Recommendation Scenario {i+1}", False, f"Error: {str(e)}")
    
    def test_market_price_apis(self):
        """Test market price retrieval and profit prediction endpoints"""
        print("\n=== Testing Market Price APIs ===")
        
        # Test GET /market/prices (all crops)
        try:
            response = self.session.get(f"{BASE_URL}/market/prices")
            
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    self.log_test("Get All Market Prices", True, f"Retrieved {len(data)} market price entries")
                else:
                    self.log_test("Get All Market Prices", False, f"Expected list, got: {type(data)}")
            else:
                self.log_test("Get All Market Prices", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("Get All Market Prices", False, f"Error: {str(e)}")
        
        # Test GET /market/prices with specific crop
        try:
            response = self.session.get(f"{BASE_URL}/market/prices", params={"crop": "Rice"})
            
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    self.log_test("Get Specific Crop Prices", True, f"Retrieved {len(data)} rice price entries")
                else:
                    self.log_test("Get Specific Crop Prices", False, f"Expected list, got: {type(data)}")
            else:
                self.log_test("Get Specific Crop Prices", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("Get Specific Crop Prices", False, f"Error: {str(e)}")
    
    def test_profit_prediction(self):
        """Test profit prediction for different crops and areas"""
        print("\n=== Testing Profit Prediction ===")
        
        profit_scenarios = [
            {"crop_name": "Rice", "area_acres": 5.0, "location": "Punjab, India"},
            {"crop_name": "Wheat", "area_acres": 10.0, "location": "Haryana, India"},
            {"crop_name": "Cotton", "area_acres": 3.5, "location": "Gujarat, India"}
        ]
        
        for i, scenario in enumerate(profit_scenarios):
            try:
                response = self.session.post(f"{BASE_URL}/market/predict-profit", params=scenario)
                
                if response.status_code == 200:
                    data = response.json()
                    required_fields = ["crop", "area", "location", "profit_analysis", "timestamp"]
                    
                    has_all_fields = all(field in data for field in required_fields)
                    has_analysis = len(data.get("profit_analysis", "")) > 100
                    
                    if has_all_fields and has_analysis:
                        self.log_test(f"Profit Prediction - {scenario['crop_name']}", True, 
                                    f"Got detailed profit analysis for {scenario['area_acres']} acres")
                    else:
                        issues = []
                        if not has_all_fields:
                            missing = [f for f in required_fields if f not in data]
                            issues.append(f"missing fields: {missing}")
                        if not has_analysis:
                            issues.append("insufficient profit analysis")
                        self.log_test(f"Profit Prediction - {scenario['crop_name']}", False, 
                                    f"Issues: {', '.join(issues)}")
                else:
                    self.log_test(f"Profit Prediction - {scenario['crop_name']}", False, 
                                f"HTTP {response.status_code}: {response.text}")
                    
                time.sleep(1)  # Delay between requests
                
            except Exception as e:
                self.log_test(f"Profit Prediction - {scenario['crop_name']}", False, f"Error: {str(e)}")
    
    def test_error_handling(self):
        """Test API responses with invalid inputs and edge cases"""
        print("\n=== Testing Error Handling ===")
        
        # Test invalid chat request
        try:
            invalid_chat = {"message": "", "session_id": "invalid"}
            response = self.session.post(f"{BASE_URL}/chat", json=invalid_chat)
            
            if response.status_code in [400, 422, 500]:
                self.log_test("Invalid Chat Request", True, f"Properly handled invalid input with HTTP {response.status_code}")
            else:
                self.log_test("Invalid Chat Request", False, f"Should reject empty message, got HTTP {response.status_code}")
        except Exception as e:
            self.log_test("Invalid Chat Request", False, f"Error: {str(e)}")
        
        # Test invalid crop recommendation
        try:
            invalid_crop_params = {
                "location": "",
                "soil_type": "invalid_soil",
                "ph_level": -1.0,  # Invalid pH
                "moisture_level": ""
            }
            response = self.session.post(f"{BASE_URL}/crops/recommend", params=invalid_crop_params)
            
            if response.status_code in [400, 422, 500]:
                self.log_test("Invalid Crop Recommendation", True, f"Properly handled invalid parameters with HTTP {response.status_code}")
            else:
                self.log_test("Invalid Crop Recommendation", False, f"Should reject invalid parameters, got HTTP {response.status_code}")
        except Exception as e:
            self.log_test("Invalid Crop Recommendation", False, f"Error: {str(e)}")
        
        # Test non-existent chat history
        try:
            fake_session_id = "non-existent-session-id"
            response = self.session.get(f"{BASE_URL}/chat/{fake_session_id}")
            
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list) and len(data) == 0:
                    self.log_test("Non-existent Chat History", True, "Properly returned empty list for non-existent session")
                else:
                    self.log_test("Non-existent Chat History", False, f"Unexpected response for non-existent session: {data}")
            else:
                self.log_test("Non-existent Chat History", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("Non-existent Chat History", False, f"Error: {str(e)}")
    
    def run_all_tests(self):
        """Run all test suites"""
        print("🚀 Starting DigiFarmer Backend API Tests")
        print(f"Testing against: {BASE_URL}")
        print("=" * 60)
        
        start_time = time.time()
        
        # Run all test suites
        self.test_api_health()
        self.test_status_endpoints()
        self.test_ai_chat_integration()
        self.test_chat_history()
        self.test_crop_recommendation_system()
        self.test_market_price_apis()
        self.test_profit_prediction()
        self.test_error_handling()
        
        end_time = time.time()
        duration = end_time - start_time
        
        # Summary
        total_tests = len(self.test_results)
        passed_tests = sum(1 for result in self.test_results if result["success"])
        failed_tests = total_tests - passed_tests
        
        print("\n" + "=" * 60)
        print("🏁 TEST SUMMARY")
        print("=" * 60)
        print(f"Total Tests: {total_tests}")
        print(f"✅ Passed: {passed_tests}")
        print(f"❌ Failed: {failed_tests}")
        print(f"⏱️  Duration: {duration:.2f} seconds")
        print(f"📊 Success Rate: {(passed_tests/total_tests)*100:.1f}%")
        
        if failed_tests > 0:
            print("\n❌ FAILED TESTS:")
            for result in self.test_results:
                if not result["success"]:
                    print(f"  - {result['test']}: {result['details']}")
        
        return {
            "total": total_tests,
            "passed": passed_tests,
            "failed": failed_tests,
            "success_rate": (passed_tests/total_tests)*100,
            "duration": duration,
            "results": self.test_results
        }

if __name__ == "__main__":
    tester = DigiFarmerAPITester()
    results = tester.run_all_tests()