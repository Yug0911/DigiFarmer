from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime
from emergentintegrations.llm.chat import LlmChat, UserMessage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

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

class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    message_type: str = "text"

class ChatResponse(BaseModel):
    response: str
    session_id: str
    message_id: str

class CropRecommendation(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    location: str
    soil_type: str
    ph_level: float
    moisture_level: str
    recommended_crops: List[str]
    confidence_score: float
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class MarketPrice(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    crop_name: str
    price_per_kg: float
    market_name: str
    location: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

# Initialize LLM Chat
def get_llm_chat(session_id: str):
    return LlmChat(
        api_key=os.environ['EMERGENT_LLM_KEY'],
        session_id=session_id,
        system_message="""You are DigiFarmer, an expert agricultural advisor AI assistant specifically designed for Indian farmers. You provide personalized advice on:

1. Crop recommendations based on soil conditions, weather, and location
2. Disease identification and treatment solutions
3. Market prices and profit predictions
4. Sustainable farming practices
5. Seasonal planning and crop rotation
6. Fertilizer and irrigation guidance

Always provide practical, location-specific advice. Ask follow-up questions when needed to give more accurate recommendations. Use simple language that farmers can understand. When discussing prices, always mention that market prices fluctuate and farmers should check current rates.

If asked about crops, diseases, or farming practices, provide detailed, actionable advice. For disease diagnosis, ask for more details about symptoms, affected plant parts, and environmental conditions."""
    ).with_model("openai", "gpt-4o-mini")

# Routes
@api_router.get("/")
async def root():
    return {"message": "DigiFarmer API - Agricultural Advisory System"}

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

@api_router.post("/chat", response_model=ChatResponse)
async def chat_with_ai(request: ChatRequest):
    try:
        # Generate session ID if not provided
        session_id = request.session_id or str(uuid.uuid4())
        
        # Initialize chat
        chat = get_llm_chat(session_id)
        
        # Create user message
        user_message = UserMessage(text=request.message)
        
        # Get AI response
        ai_response = await chat.send_message(user_message)
        
        # Store in database
        chat_message = ChatMessage(
            session_id=session_id,
            message=request.message,
            response=ai_response,
            message_type=request.message_type
        )
        
        await db.chat_messages.insert_one(chat_message.dict())
        
        return ChatResponse(
            response=ai_response,
            session_id=session_id,
            message_id=chat_message.id
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

@api_router.post("/crops/recommend")
async def recommend_crops(location: str, soil_type: str, ph_level: float, moisture_level: str):
    try:
        # Get AI recommendation
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
        
        # Parse AI response to extract crop names (simplified)
        # In a real implementation, you'd parse the structured response
        recommended_crops = ["Rice", "Wheat", "Sugarcane"]  # Placeholder
        
        recommendation = CropRecommendation(
            location=location,
            soil_type=soil_type,
            ph_level=ph_level,
            moisture_level=moisture_level,
            recommended_crops=recommended_crops,
            confidence_score=0.85
        )
        
        await db.crop_recommendations.insert_one(recommendation.dict())
        
        return {
            "recommendation": recommendation,
            "ai_advice": ai_response
        }
        
    except Exception as e:
        logging.error(f"Crop recommendation error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to generate crop recommendations")

@api_router.get("/market/prices")
async def get_market_prices(crop: Optional[str] = None):
    try:
        query = {"crop_name": crop} if crop else {}
        prices = await db.market_prices.find(query).sort("timestamp", -1).to_list(50)
        return [MarketPrice(**price) for price in prices]
    except Exception as e:
        logging.error(f"Market prices error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve market prices")

@api_router.post("/market/predict-profit")
async def predict_profit(crop_name: str, area_acres: float, location: str):
    try:
        # Get AI profit prediction
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
        logging.error(f"Profit prediction error: {str(e)}")
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

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()