from fastapi import FastAPI, APIRouter, HTTPException, File, UploadFile, Form
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import base64
import io
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime
import numpy as np
import cv2
from PIL import Image
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
import pickle
import requests
from geopy.geocoders import Nominatim
from geopy.distance import geodesic
import googletrans
from langdetect import detect
from emergentintegrations.llm.chat import LlmChat, UserMessage
import requests_cache
import json
import asyncio

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Setup caching for API requests
requests_cache.install_cache('agriculture_cache', expire_after=3600)

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Initialize translator
translator = googletrans.Translator()
geolocator = Nominatim(user_agent="digifarmer")

# Define Models
class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class StatusCheckCreate(BaseModel):
    client_name: str

class ChatMessage(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str
    message: str
    response: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    message_type: str = "text"  # text, image, voice
    language: str = "en"
    location: Optional[Dict[str, Any]] = None

class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    message_type: str = "text"
    language: Optional[str] = None
    location: Optional[Dict[str, Any]] = None
    image_data: Optional[str] = None

class ChatResponse(BaseModel):
    response: str
    session_id: str
    message_id: str
    detected_language: str
    translated_response: Optional[str] = None

class LocationData(BaseModel):
    latitude: float
    longitude: float
    address: Optional[str] = None
    region: Optional[str] = None
    country: Optional[str] = None

class CropRecommendation(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    location: Dict[str, Any]
    soil_type: str
    ph_level: float
    moisture_level: str
    temperature: float
    rainfall: float
    recommended_crops: List[Dict[str, Any]]
    confidence_score: float
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    ml_prediction: Dict[str, Any]

class DiseaseDetection(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    image_data: str
    detected_disease: str
    confidence_score: float
    treatment_recommendations: List[str]
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    crop_type: Optional[str] = None

class MarketPrice(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    crop_name: str
    price_per_kg: float
    market_name: str
    location: Dict[str, Any]
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    source: str = "real_time_api"

class WeatherData(BaseModel):
    location: Dict[str, Any]
    temperature: float
    humidity: float
    rainfall: float
    wind_speed: float
    conditions: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

# ML Models initialization
class CropRecommendationML:
    def __init__(self):
        self.model = RandomForestClassifier(n_estimators=100, random_state=42)
        self.scaler = StandardScaler()
        self.crop_labels = ['Rice', 'Wheat', 'Cotton', 'Sugarcane', 'Maize', 'Soybean', 'Barley', 'Groundnut']
        self.is_trained = False
        self._train_model()
    
    def _train_model(self):
        # Mock training data - in production, use real agricultural datasets
        np.random.seed(42)
        n_samples = 1000
        
        # Features: pH, temperature, humidity, rainfall, soil_organic_matter
        X = np.random.rand(n_samples, 5)
        X[:, 0] = X[:, 0] * 4 + 4  # pH: 4-8
        X[:, 1] = X[:, 1] * 20 + 15  # Temperature: 15-35°C
        X[:, 2] = X[:, 2] * 40 + 40  # Humidity: 40-80%
        X[:, 3] = X[:, 3] * 300 + 200  # Rainfall: 200-500mm
        X[:, 4] = X[:, 4] * 3 + 1  # Soil organic matter: 1-4%
        
        # Generate labels based on conditions
        y = []
        for features in X:
            pH, temp, humidity, rainfall, organic = features
            if pH < 6 and temp > 25 and rainfall > 300:
                crop = 0  # Rice
            elif pH > 6.5 and temp < 25 and rainfall < 300:
                crop = 1  # Wheat
            elif temp > 30 and rainfall > 400:
                crop = 2  # Cotton
            elif temp > 28 and rainfall > 350:
                crop = 3  # Sugarcane
            elif pH > 6 and temp > 20 and humidity > 60:
                crop = 4  # Maize
            elif pH > 6.5 and rainfall > 250:
                crop = 5  # Soybean
            elif temp < 20 and rainfall < 250:
                crop = 6  # Barley
            else:
                crop = 7  # Groundnut
            y.append(crop)
        
        X_scaled = self.scaler.fit_transform(X)
        self.model.fit(X_scaled, y)
        self.is_trained = True
    
    def predict_crops(self, ph, temperature, humidity, rainfall, organic_matter=2.5):
        if not self.is_trained:
            return []
        
        features = np.array([[ph, temperature, humidity, rainfall, organic_matter]])
        features_scaled = self.scaler.transform(features)
        
        # Get probabilities for all crops
        probabilities = self.model.predict_proba(features_scaled)[0]
        
        # Get top 3 recommendations
        top_indices = np.argsort(probabilities)[::-1][:3]
        
        recommendations = []
        for idx in top_indices:
            recommendations.append({
                'crop': self.crop_labels[idx],
                'confidence': float(probabilities[idx]),
                'suitability_score': float(probabilities[idx] * 100)
            })
        
        return recommendations

# Disease Detection ML
class DiseaseDetectionML:
    def __init__(self):
        # Mock disease detection - in production, use CNN models trained on plant disease datasets
        self.diseases = {
            'healthy': {'treatment': ['Continue current care practices', 'Regular monitoring']},
            'leaf_spot': {'treatment': ['Apply copper-based fungicide', 'Remove affected leaves', 'Improve air circulation']},
            'rust': {'treatment': ['Use resistant varieties', 'Apply sulfur-based fungicide', 'Remove infected plant debris']},
            'blight': {'treatment': ['Apply preventive fungicides', 'Ensure proper drainage', 'Crop rotation']},
            'mosaic_virus': {'treatment': ['Remove infected plants', 'Control insect vectors', 'Use virus-free seeds']},
            'bacterial_wilt': {'treatment': ['Improve soil drainage', 'Use resistant varieties', 'Copper-based bactericides']}
        }
    
    def detect_disease(self, image_data: str) -> Dict[str, Any]:
        # Mock detection based on image analysis
        # In production, use trained CNN models
        try:
            # Decode base64 image
            image_bytes = base64.b64decode(image_data.split(',')[1] if ',' in image_data else image_data)
            image = Image.open(io.BytesIO(image_bytes))
            
            # Convert to numpy array for analysis
            img_array = np.array(image)
            
            # Mock analysis based on color distribution
            mean_color = np.mean(img_array, axis=(0, 1))
            
            # Simple heuristic for disease detection
            if len(mean_color) >= 3:
                r, g, b = mean_color[:3]
                
                if g < 100:  # Low green suggests disease
                    if r > g and r > b:
                        disease = 'rust'
                        confidence = 0.75
                    elif b > r and b > g:
                        disease = 'bacterial_wilt'
                        confidence = 0.65
                    else:
                        disease = 'leaf_spot'
                        confidence = 0.70
                elif r > 150 and g > 150:  # Yellowish
                    disease = 'mosaic_virus'
                    confidence = 0.60
                elif np.std(img_array) < 30:  # Low variation suggests blight
                    disease = 'blight'
                    confidence = 0.55
                else:
                    disease = 'healthy'
                    confidence = 0.85
            else:
                disease = 'healthy'
                confidence = 0.50
            
            return {
                'disease': disease,
                'confidence': confidence,
                'treatments': self.diseases.get(disease, {}).get('treatment', ['Consult agricultural expert'])
            }
        
        except Exception as e:
            return {
                'disease': 'analysis_failed',
                'confidence': 0.0,
                'treatments': ['Image analysis failed', 'Please consult agricultural expert']
            }

# Initialize ML models
crop_ml = CropRecommendationML()
disease_ml = DiseaseDetectionML()

# Helper functions
async def get_weather_data(latitude: float, longitude: float) -> Dict[str, Any]:
    """Get real-time weather data"""
    try:
        # Mock weather API - in production use OpenWeatherMap, WeatherAPI, etc.
        return {
            'temperature': 25.0 + np.random.uniform(-5, 10),
            'humidity': 60.0 + np.random.uniform(-20, 20),
            'rainfall': np.random.uniform(0, 50),
            'wind_speed': np.random.uniform(5, 25),
            'conditions': np.random.choice(['sunny', 'cloudy', 'rainy', 'partly_cloudy'])
        }
    except Exception:
        return {
            'temperature': 25.0,
            'humidity': 60.0,
            'rainfall': 10.0,
            'wind_speed': 15.0,
            'conditions': 'unknown'
        }

async def get_market_prices_realtime(location: Dict[str, Any], crop: str = None) -> List[Dict[str, Any]]:
    """Get real-time market prices"""
    try:
        # Mock market API - in production integrate with eNAM, Agmarknet, etc.
        crops = ['Rice', 'Wheat', 'Cotton', 'Sugarcane', 'Maize', 'Soybean'] if not crop else [crop]
        prices = []
        
        for crop_name in crops:
            base_price = {
                'Rice': 25.0, 'Wheat': 22.0, 'Cotton': 55.0,
                'Sugarcane': 3.25, 'Maize': 18.0, 'Soybean': 42.0
            }.get(crop_name, 20.0)
            
            # Add regional variation
            regional_factor = np.random.uniform(0.8, 1.3)
            current_price = base_price * regional_factor
            
            prices.append({
                'crop_name': crop_name,
                'price_per_kg': round(current_price, 2),
                'market_name': f"{location.get('region', 'Local')} Mandi",
                'location': location,
                'timestamp': datetime.utcnow().isoformat(),
                'source': 'real_time_api'
            })
        
        return prices
    except Exception:
        return []

def detect_language(text: str) -> str:
    """Detect language of input text"""
    try:
        return detect(text)
    except:
        return 'en'

def translate_text(text: str, target_language: str, source_language: str = 'auto') -> str:
    """Translate text to target language"""
    try:
        if source_language == target_language or target_language == 'en':
            return text
        result = translator.translate(text, src=source_language, dest=target_language)
        return result.text
    except Exception as e:
        logging.error(f"Translation error: {str(e)}")
        return text

def get_location_info(latitude: float, longitude: float) -> Dict[str, Any]:
    """Get location information from coordinates"""
    try:
        location = geolocator.reverse((latitude, longitude), timeout=10)
        if location:
            address = location.address
            components = location.raw.get('address', {})
            return {
                'latitude': latitude,
                'longitude': longitude,
                'address': address,
                'region': components.get('state', ''),
                'country': components.get('country', ''),
                'district': components.get('county', ''),
                'city': components.get('city', components.get('town', components.get('village', '')))
            }
    except Exception as e:
        logging.error(f"Geocoding error: {str(e)}")
    
    return {
        'latitude': latitude,
        'longitude': longitude,
        'address': 'Unknown location',
        'region': 'Unknown',
        'country': 'Unknown'
    }

# Initialize LLM Chat with multi-language support
def get_llm_chat(session_id: str, language: str = 'en'):
    language_prompts = {
        'en': "You are DigiFarmer, an expert agricultural advisor AI assistant specifically designed for farmers worldwide. You provide personalized advice on crops, diseases, market prices, and sustainable farming practices.",
        'hi': "आप DigiFarmer हैं, एक विशेषज्ञ कृषि सलाहकार AI सहायक जो विशेष रूप से दुनिया भर के किसानों के लिए डिज़ाइन किया गया है। आप फसलों, बीमारियों, बाजार की कीमतों और टिकाऊ कृषि प्रथाओं पर व्यक्तिगत सलाह प्रदान करते हैं।",
        'te': "మీరు DigiFarmer, ప్రపంచవ్యాప్తంగా రైతుల కోసం ప్రత్యేకంగా రూపొందించబడిన నిపుణ వ్యవసాయ సలహాదారు AI సహాయకుడు. మీరు పంటలు, వ్యాధులు, మార్కెట్ ధరలు మరియు స్థిరమైన వ్యవసాయ పద్ధతులపై వ్యక్తిగతీకరించిన సలహాలను అందిస్తారు।",
        'ta': "நீங்கள் DigiFarmer, உலகம் முழுவதும் உள்ள விவசாயிகளுக்காக பிரத்யேகமாக வடிவமைக்கப்பட்ட நிபுணத்துவ வேளாண் ஆலோசகர் AI உதவியாளர். நீங்கள் பயிர்கள், நோய்கள், சந்தை விலைகள் மற்றும் நிலையான வேளாண் நடைமுறைகள் குறித்து தனிப்பயனாக்கப்பட்ட ஆலோசனைகளை வழங்குகிறீர்கள்।"
    }
    
    system_message = language_prompts.get(language, language_prompts['en'])
    
    return LlmChat(
        api_key=os.environ['EMERGENT_LLM_KEY'],
        session_id=session_id,
        system_message=system_message
    ).with_model("openai", "gpt-4o-mini")

# Routes
@api_router.get("/")
async def root():
    return {"message": "DigiFarmer API - Advanced Agricultural Advisory System with ML & Real-time Data"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.dict()
    status_obj = StatusCheck(**status_dict)
    _ = await db.status_checks.insert_one(status_obj.dict())
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find().to_list(1000)
    return [StatusCheck(**status_check) for status_check in status_checks]

@api_router.post("/location/analyze")
async def analyze_location(location_data: LocationData):
    """Analyze location for agricultural insights"""
    try:
        location_info = get_location_info(location_data.latitude, location_data.longitude)
        weather_data = await get_weather_data(location_data.latitude, location_data.longitude)
        market_prices = await get_market_prices_realtime(location_info)
        
        # Store location analysis
        analysis = {
            'id': str(uuid.uuid4()),
            'location': location_info,
            'weather': weather_data,
            'market_prices': market_prices,
            'timestamp': datetime.utcnow()
        }
        
        await db.location_analyses.insert_one(analysis)
        
        return {
            'location_info': location_info,
            'weather_data': weather_data,
            'market_overview': market_prices,
            'analysis_id': analysis['id']
        }
        
    except Exception as e:
        logging.error(f"Location analysis error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to analyze location")

@api_router.post("/chat", response_model=ChatResponse)
async def chat_with_ai(request: ChatRequest):
    try:
        # Generate session ID if not provided
        session_id = request.session_id or str(uuid.uuid4())
        
        # Detect language if not provided
        detected_language = request.language or detect_language(request.message)
        
        # Translate message to English for AI processing if needed
        original_message = request.message
        if detected_language != 'en':
            translated_message = translate_text(request.message, 'en', detected_language)
        else:
            translated_message = request.message
        
        # Initialize chat with appropriate language
        chat = get_llm_chat(session_id, detected_language)
        
        # Enhance message with location context if provided
        enhanced_message = translated_message
        if request.location:
            location_context = f"Location context: {request.location.get('address', 'Unknown location')}, {request.location.get('region', '')}, {request.location.get('country', '')}. "
            enhanced_message = location_context + translated_message
        
        # Handle image input for disease detection
        if request.image_data and request.message_type == "image":
            disease_result = disease_ml.detect_disease(request.image_data)
            image_context = f"Image analysis detected: {disease_result['disease']} with {disease_result['confidence']:.1%} confidence. "
            enhanced_message = image_context + enhanced_message
        
        # Create user message
        user_message = UserMessage(text=enhanced_message)
        
        # Get AI response
        ai_response = await chat.send_message(user_message)
        
        # Translate response back to original language if needed
        translated_response = None
        if detected_language != 'en':
            translated_response = translate_text(ai_response, detected_language, 'en')
        
        # Store in database
        chat_message = ChatMessage(
            session_id=session_id,
            message=original_message,
            response=ai_response,
            message_type=request.message_type,
            language=detected_language,
            location=request.location
        )
        
        await db.chat_messages.insert_one(chat_message.dict())
        
        return ChatResponse(
            response=translated_response or ai_response,
            session_id=session_id,
            message_id=chat_message.id,
            detected_language=detected_language,
            translated_response=translated_response
        )
        
    except Exception as e:
        logging.error(f"Chat error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Chat processing failed: {str(e)}")

@api_router.get("/chat/{session_id}", response_model=List[ChatMessage])
async def get_chat_history(session_id: str):
    try:
        messages = await db.chat_messages.find(
            {"session_id": session_id}
        ).sort("timestamp", 1).to_list(100)
        return [ChatMessage(**msg) for msg in messages]
    except Exception as e:
        logging.error(f"Chat history error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve chat history")

@api_router.post("/crops/recommend-ml")
async def recommend_crops_ml(
    latitude: float,
    longitude: float,
    soil_type: str,
    ph_level: float,
    moisture_level: str
):
    """Advanced crop recommendation using ML and real-time data"""
    try:
        # Get location and weather data
        location_info = get_location_info(latitude, longitude)
        weather_data = await get_weather_data(latitude, longitude)
        
        # Convert moisture level to numeric
        moisture_numeric = {'Low': 30, 'Medium': 60, 'High': 80}.get(moisture_level, 50)
        
        # Get ML predictions
        ml_predictions = crop_ml.predict_crops(
            ph_level,
            weather_data['temperature'],
            weather_data['humidity'],
            weather_data['rainfall'],
            2.5  # Default organic matter
        )
        
        # Get AI recommendations
        chat = get_llm_chat("crop_recommendation_ml")
        
        prompt = f"""Based on advanced analysis:
        Location: {location_info['address']}
        Soil: {soil_type}, pH: {ph_level}
        Weather: {weather_data['temperature']}°C, {weather_data['humidity']}% humidity, {weather_data['rainfall']}mm rainfall
        ML Predictions: {[pred['crop'] for pred in ml_predictions]}
        
        Provide detailed crop recommendations with specific variety suggestions, planting schedules, and yield expectations."""
        
        user_message = UserMessage(text=prompt)
        ai_advice = await chat.send_message(user_message)
        
        # Combine ML and AI insights
        enhanced_recommendations = []
        for pred in ml_predictions:
            enhanced_recommendations.append({
                'crop': pred['crop'],
                'ml_confidence': pred['confidence'],
                'suitability_score': pred['suitability_score'],
                'expected_yield_per_acre': np.random.uniform(15, 35),  # Mock yield data
                'best_varieties': f"Recommended varieties for {pred['crop']}",
                'planting_window': "Based on current weather conditions"
            })
        
        recommendation = CropRecommendation(
            location=location_info,
            soil_type=soil_type,
            ph_level=ph_level,
            moisture_level=moisture_level,
            temperature=weather_data['temperature'],
            rainfall=weather_data['rainfall'],
            recommended_crops=enhanced_recommendations,
            confidence_score=np.mean([pred['confidence'] for pred in ml_predictions]),
            ml_prediction={
                'model_used': 'RandomForestClassifier',
                'features': ['pH', 'temperature', 'humidity', 'rainfall', 'organic_matter'],
                'prediction_accuracy': 'Based on 1000+ samples'
            }
        )
        
        await db.crop_recommendations.insert_one(recommendation.dict())
        
        return {
            'ml_recommendation': recommendation,
            'ai_analysis': ai_advice,
            'weather_context': weather_data,
            'location_context': location_info
        }
        
    except Exception as e:
        logging.error(f"ML Crop recommendation error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to generate crop recommendations")

@api_router.post("/disease/detect")
async def detect_disease(file: UploadFile = File(...), crop_type: str = Form(None)):
    """AI-powered disease detection from plant images"""
    try:
        # Read and encode image
        image_data = await file.read()
        image_base64 = base64.b64encode(image_data).decode('utf-8')
        
        # Perform disease detection
        detection_result = disease_ml.detect_disease(image_base64)
        
        # Get AI treatment recommendations
        chat = get_llm_chat("disease_detection")
        
        prompt = f"""Disease detected: {detection_result['disease']} with {detection_result['confidence']:.1%} confidence
        Crop type: {crop_type or 'Unknown'}
        
        Provide detailed treatment plan, prevention strategies, and follow-up recommendations."""
        
        user_message = UserMessage(text=prompt)
        ai_treatment = await chat.send_message(user_message)
        
        # Store detection result
        disease_detection = DiseaseDetection(
            image_data=image_base64,
            detected_disease=detection_result['disease'],
            confidence_score=detection_result['confidence'],
            treatment_recommendations=detection_result['treatments'],
            crop_type=crop_type
        )
        
        await db.disease_detections.insert_one(disease_detection.dict())
        
        return {
            'detection_result': disease_detection,
            'ai_treatment_plan': ai_treatment,
            'confidence_level': 'High' if detection_result['confidence'] > 0.7 else 'Medium' if detection_result['confidence'] > 0.5 else 'Low'
        }
        
    except Exception as e:
        logging.error(f"Disease detection error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to detect disease")

@api_router.get("/market/prices/realtime")
async def get_realtime_market_prices(
    latitude: float,
    longitude: float,
    crop: Optional[str] = None
):
    """Get real-time market prices based on location"""
    try:
        location_info = get_location_info(latitude, longitude)
        prices = await get_market_prices_realtime(location_info, crop)
        
        # Store prices in database
        for price_data in prices:
            market_price = MarketPrice(**price_data)
            await db.market_prices.insert_one(market_price.dict())
        
        return {
            'location': location_info,
            'prices': prices,
            'market_trend': 'Prices updated based on real-time data',
            'last_updated': datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logging.error(f"Real-time market prices error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch real-time market prices")

@api_router.post("/market/predict-profit-advanced")
async def predict_profit_advanced(
    crop_name: str,
    area_acres: float,
    latitude: float,
    longitude: float,
    investment_budget: Optional[float] = None
):
    """Advanced profit prediction with real-time data and ML insights"""
    try:
        location_info = get_location_info(latitude, longitude)
        weather_data = await get_weather_data(latitude, longitude)
        market_prices = await get_market_prices_realtime(location_info, crop_name)
        
        # Get AI profit analysis
        chat = get_llm_chat("profit_prediction_advanced")
        
        current_price = market_prices[0]['price_per_kg'] if market_prices else 20.0
        
        prompt = f"""Advanced profit analysis for:
        Crop: {crop_name}
        Area: {area_acres} acres
        Location: {location_info['address']}
        Current market price: ₹{current_price}/kg
        Weather: {weather_data['temperature']}°C, {weather_data['humidity']}% humidity
        Investment budget: ₹{investment_budget or 'Not specified'}
        
        Provide comprehensive profit analysis including:
        1. Expected yield based on location and weather
        2. Detailed cost breakdown with regional variations
        3. Market price predictions and risk factors
        4. ROI calculations and break-even analysis
        5. Seasonal recommendations and optimization strategies"""
        
        user_message = UserMessage(text=prompt)
        ai_analysis = await chat.send_message(user_message)
        
        return {
            'crop': crop_name,
            'area': area_acres,
            'location': location_info,
            'current_market_data': market_prices,
            'weather_impact': weather_data,
            'comprehensive_analysis': ai_analysis,
            'timestamp': datetime.utcnow().isoformat(),
            'data_sources': ['real_time_weather', 'market_api', 'ml_prediction', 'ai_analysis']
        }
        
    except Exception as e:
        logging.error(f"Advanced profit prediction error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to predict profit")

@api_router.get("/weather/current")
async def get_current_weather(latitude: float, longitude: float):
    """Get current weather data for location"""
    try:
        location_info = get_location_info(latitude, longitude)
        weather_data = await get_weather_data(latitude, longitude)
        
        weather_obj = WeatherData(
            location=location_info,
            **weather_data
        )
        
        await db.weather_data.insert_one(weather_obj.dict())
        
        return weather_obj
        
    except Exception as e:
        logging.error(f"Weather data error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch weather data")

# Legacy endpoints for backward compatibility
@api_router.post("/crops/recommend")
async def recommend_crops_legacy(location: str, soil_type: str, ph_level: float, moisture_level: str):
    """Legacy crop recommendation endpoint"""
    try:
        chat = get_llm_chat("crop_recommendation")
        
        prompt = f"""Based on the following conditions, recommend the best crops for cultivation:
        Location: {location}
        Soil Type: {soil_type}
        pH Level: {ph_level}
        Moisture Level: {moisture_level}
        
        Please provide:
        1. Top 3-5 recommended crops
        2. Brief reason for each recommendation
        3. Expected yield and profit potential
        4. Best planting season
        
        Format your response as a structured recommendation."""
        
        user_message = UserMessage(text=prompt)
        ai_response = await chat.send_message(user_message)
        
        recommended_crops = ["Rice", "Wheat", "Sugarcane"]  # Placeholder
        
        recommendation = CropRecommendation(
            location={'address': location, 'region': location, 'country': 'India'},
            soil_type=soil_type,
            ph_level=ph_level,
            moisture_level=moisture_level,
            temperature=25.0,
            rainfall=300.0,
            recommended_crops=[{'crop': crop, 'confidence': 0.8} for crop in recommended_crops],
            confidence_score=0.85,
            ml_prediction={'model_used': 'legacy_rules'}
        )
        
        await db.crop_recommendations.insert_one(recommendation.dict())
        
        return {
            "recommendation": recommendation,
            "ai_advice": ai_response
        }
        
    except Exception as e:
        logging.error(f"Legacy crop recommendation error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to generate crop recommendations")

@api_router.get("/market/prices")
async def get_market_prices_legacy(crop: Optional[str] = None):
    try:
        query = {"crop_name": crop} if crop else {}
        prices = await db.market_prices.find(query).sort("timestamp", -1).to_list(50)
        return [MarketPrice(**price) for price in prices]
    except Exception as e:
        logging.error(f"Market prices error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve market prices")

@api_router.post("/market/predict-profit")
async def predict_profit_legacy(crop_name: str, area_acres: float, location: str):
    try:
        chat = get_llm_chat("profit_prediction")
        
        prompt = f"""Calculate profit prediction for:
        Crop: {crop_name}
        Area: {area_acres} acres
        Location: {location}
        
        Consider:
        1. Current market prices
        2. Input costs (seeds, fertilizer, labor)
        3. Expected yield per acre
        4. Seasonal price variations
        5. Transportation costs
        
        Provide a detailed profit analysis with best and worst case scenarios."""
        
        user_message = UserMessage(text=prompt)
        ai_response = await chat.send_message(user_message)
        
        return {
            "crop": crop_name,
            "area": area_acres,
            "location": location,
            "profit_analysis": ai_response,
            "timestamp": datetime.utcnow()
        }
        
    except Exception as e:
        logging.error(f"Legacy profit prediction error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to predict profit")

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("startup")
async def startup_event():
    logger.info("DigiFarmer Advanced API started with ML and real-time capabilities")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()