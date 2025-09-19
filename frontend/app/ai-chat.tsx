import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';

const BACKEND_URL = Constants.expoConfig?.extra?.EXPO_BACKEND_URL || process.env.EXPO_PUBLIC_BACKEND_URL;

interface ChatMessage {
  id: string;
  message: string;
  response: string;
  timestamp: string;
  isUser: boolean;
  language?: string;
  hasImage?: boolean;
  imageUri?: string;
}

interface LocationData {
  latitude: number;
  longitude: number;
  address?: string;
  region?: string;
  country?: string;
}

const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'hi', name: 'हिन्दी', flag: '🇮🇳' },
  { code: 'te', name: 'తెలుగు', flag: '🇮🇳' },
  { code: 'ta', name: 'தமிழ்', flag: '🇮🇳' },
  { code: 'mr', name: 'मराठी', flag: '🇮🇳' },
  { code: 'bn', name: 'বাংলা', flag: '🇮🇳' },
  { code: 'gu', name: 'ગુજરાતી', flag: '🇮🇳' },
  { code: 'kn', name: 'ಕನ್ನಡ', flag: '🇮🇳' },
];

export default function AIChatScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId] = useState(() => `ai_chat_${Date.now()}`);
  const [selectedLanguage, setSelectedLanguage] = useState('en');
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [location, setLocation] = useState<LocationData | null>(null);
  const [locationPermission, setLocationPermission] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  useEffect(() => {
    loadCachedMessages();
    requestLocationPermission();
  }, []);

  const loadCachedMessages = async () => {
    try {
      const cached = await AsyncStorage.getItem(`ai_chat_${sessionId}`);
      if (cached) {
        setMessages(JSON.parse(cached));
      }
    } catch (error) {
      console.error('Error loading cached messages:', error);
    }
  };

  const saveCachedMessages = async (newMessages: ChatMessage[]) => {
    try {
      await AsyncStorage.setItem(`ai_chat_${sessionId}`, JSON.stringify(newMessages));
    } catch (error) {
      console.error('Error saving messages:', error);
    }
  };

  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        setLocationPermission(true);
        getCurrentLocation();
      }
    } catch (error) {
      console.error('Location permission error:', error);
    }
  };

  const getCurrentLocation = async () => {
    try {
      const locationData = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = locationData.coords;
      
      // Get location details
      const locationDetails = await Location.reverseGeocodeAsync({ latitude, longitude });
      const address = locationDetails[0];
      
      setLocation({
        latitude,
        longitude,
        address: `${address?.name || ''}, ${address?.city || ''}, ${address?.region || ''}`,
        region: address?.region || '',
        country: address?.country || '',
      });
    } catch (error) {
      console.error('Error getting location:', error);
    }
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets[0]) {
        setSelectedImage(result.assets[0].base64 || null);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const takePhoto = async () => {
    try {
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets[0]) {
        setSelectedImage(result.assets[0].base64 || null);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo');
    }
  };

  const sendMessage = async (message: string) => {
    if (!message.trim() && !selectedImage) return;

    setIsLoading(true);
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      message: message || 'Image uploaded for disease detection',
      response: '',
      timestamp: new Date().toISOString(),
      isUser: true,
      language: selectedLanguage,
      hasImage: !!selectedImage,
      imageUri: selectedImage ? `data:image/jpeg;base64,${selectedImage}` : undefined,
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInputMessage('');
    await saveCachedMessages(updatedMessages);

    try {
      const response = await fetch(`${BACKEND_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: message || 'Please analyze this plant image for diseases',
          session_id: sessionId,
          message_type: selectedImage ? 'image' : 'text',
          language: selectedLanguage,
          location: location,
          image_data: selectedImage ? `data:image/jpeg;base64,${selectedImage}` : null,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      const aiMessage: ChatMessage = {
        id: data.message_id,
        message: '',
        response: data.translated_response || data.response,
        timestamp: new Date().toISOString(),
        isUser: false,
        language: data.detected_language,
      };

      const finalMessages = [...updatedMessages, aiMessage];
      setMessages(finalMessages);
      await saveCachedMessages(finalMessages);

    } catch (error) {
      console.error('Chat error:', error);
      
      const offlineMessage: ChatMessage = {
        id: `offline_${Date.now()}`,
        message: '',
        response: "I'm currently offline. Your message has been saved and I'll respond when connection is restored.",
        timestamp: new Date().toISOString(),
        isUser: false,
      };

      const offlineMessages = [...updatedMessages, offlineMessage];
      setMessages(offlineMessages);
      await saveCachedMessages(offlineMessages);
      
      Alert.alert('Offline Mode', 'Your message has been saved for later processing.');
    } finally {
      setIsLoading(false);
      setSelectedImage(null);
    }
  };

  const renderMessage = (item: ChatMessage, index: number) => (
    <View key={item.id || index} style={[
      styles.messageContainer,
      item.isUser ? styles.userMessage : styles.aiMessage
    ]}>
      <View style={[
        styles.messageBubble,
        item.isUser ? styles.userBubble : styles.aiBubble
      ]}>
        {item.hasImage && item.imageUri && (
          <View style={styles.imageContainer}>
            <Text style={styles.imageLabel}>🖼️ Image Analysis</Text>
          </View>
        )}
        <Text style={[
          styles.messageText,
          item.isUser ? styles.userMessageText : styles.aiMessageText
        ]}>
          {item.isUser ? item.message : item.response}
        </Text>
        {item.language && item.language !== 'en' && (
          <View style={styles.languageIndicator}>
            <Ionicons name="language" size={12} color="#666" />
            <Text style={styles.languageText}>
              {SUPPORTED_LANGUAGES.find(lang => lang.code === item.language)?.name || item.language}
            </Text>
          </View>
        )}
      </View>
    </View>
  );

  const quickPrompts = [
    { text: 'Crop recommendations for my location', icon: 'leaf-outline' },
    { text: 'Market prices today', icon: 'trending-up-outline' },
    { text: 'Weather impact on farming', icon: 'cloud-outline' },
    { text: 'Organic farming tips', icon: 'nutrition-outline' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="chatbubbles" size={24} color="#FFFFFF" />
          <Text style={styles.headerTitle}>AI Agricultural Chat</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.languageButton}
            onPress={() => setShowLanguageModal(true)}
          >
            <Text style={styles.languageButtonText}>
              {SUPPORTED_LANGUAGES.find(lang => lang.code === selectedLanguage)?.flag || '🌐'}
            </Text>
          </TouchableOpacity>
          {location && (
            <View style={styles.locationIndicator}>
              <Ionicons name="location" size={14} color="#E8F5E8" />
            </View>
          )}
        </View>
      </View>

      <KeyboardAvoidingView 
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {messages.length === 0 ? (
          <ScrollView style={styles.welcomeContainer} showsVerticalScrollIndicator={false}>
            <View style={styles.welcomeContent}>
              <Ionicons name="chatbubbles" size={64} color="#4CAF50" />
              <Text style={styles.welcomeTitle}>AI Agricultural Assistant</Text>
              <Text style={styles.welcomeText}>
                Ask questions in your native language about farming, crops, diseases, 
                market prices, and get expert advice powered by AI.
              </Text>
              
              <Text style={styles.featuresTitle}>Features:</Text>
              <View style={styles.featuresList}>
                <View style={styles.featureItem}>
                  <Ionicons name="language" size={16} color="#4CAF50" />
                  <Text style={styles.featureText}>Multi-language support (8+ languages)</Text>
                </View>
                <View style={styles.featureItem}>
                  <Ionicons name="camera" size={16} color="#4CAF50" />
                  <Text style={styles.featureText}>Image-based disease detection</Text>
                </View>
                <View style={styles.featureItem}>
                  <Ionicons name="location" size={16} color="#4CAF50" />
                  <Text style={styles.featureText}>Location-aware recommendations</Text>
                </View>
                <View style={styles.featureItem}>
                  <Ionicons name="cloud-offline" size={16} color="#4CAF50" />
                  <Text style={styles.featureText}>Offline message saving</Text>
                </View>
              </View>

              <Text style={styles.quickPromptsTitle}>Quick Questions:</Text>
              <View style={styles.quickPrompts}>
                {quickPrompts.map((prompt, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.quickPromptButton}
                    onPress={() => sendMessage(prompt.text)}
                  >
                    <Ionicons name={prompt.icon as any} size={16} color="#4CAF50" />
                    <Text style={styles.quickPromptText}>{prompt.text}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </ScrollView>
        ) : (
          <ScrollView 
            style={styles.messagesContainer} 
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.messagesContent}
          >
            {messages.map(renderMessage)}
            {isLoading && (
              <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>AI is analyzing...</Text>
              </View>
            )}
          </ScrollView>
        )}

        {/* Image Preview */}
        {selectedImage && (
          <View style={styles.imagePreview}>
            <Text style={styles.imagePreviewText}>🖼️ Image ready for analysis</Text>
            <TouchableOpacity onPress={() => setSelectedImage(null)}>
              <Ionicons name="close-circle" size={24} color="#F44336" />
            </TouchableOpacity>
          </View>
        )}

        {/* Input Area */}
        <View style={styles.inputContainer}>
          <View style={styles.inputRow}>
            <TouchableOpacity style={styles.imageButton} onPress={pickImage}>
              <Ionicons name="image" size={20} color="#4CAF50" />
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.imageButton} onPress={takePhoto}>
              <Ionicons name="camera" size={20} color="#4CAF50" />
            </TouchableOpacity>
            
            <TextInput
              style={styles.textInput}
              value={inputMessage}
              onChangeText={setInputMessage}
              placeholder={`Ask in ${SUPPORTED_LANGUAGES.find(lang => lang.code === selectedLanguage)?.name}...`}
              placeholderTextColor="#999"
              multiline
              maxLength={1000}
            />
            
            <TouchableOpacity
              style={[styles.sendButton, { opacity: (inputMessage.trim() || selectedImage) ? 1 : 0.5 }]}
              onPress={() => sendMessage(inputMessage)}
              disabled={isLoading || (!inputMessage.trim() && !selectedImage)}
            >
              <Ionicons name="send" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Language Selection Modal */}
      <Modal
        visible={showLanguageModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowLanguageModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.languageModal}>
            <Text style={styles.modalTitle}>Select Language</Text>
            <ScrollView>
              {SUPPORTED_LANGUAGES.map((language) => (
                <TouchableOpacity
                  key={language.code}
                  style={[
                    styles.languageOption,
                    selectedLanguage === language.code && styles.selectedLanguageOption
                  ]}
                  onPress={() => {
                    setSelectedLanguage(language.code);
                    setShowLanguageModal(false);
                  }}
                >
                  <Text style={styles.languageFlag}>{language.flag}</Text>
                  <Text style={styles.languageName}>{language.name}</Text>
                  {selectedLanguage === language.code && (
                    <Ionicons name="checkmark" size={20} color="#4CAF50" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={styles.closeModalButton}
              onPress={() => setShowLanguageModal(false)}
            >
              <Text style={styles.closeModalText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    backgroundColor: '#2E7D32',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginLeft: 8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  languageButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 8,
  },
  languageButtonText: {
    fontSize: 16,
  },
  locationIndicator: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
    padding: 4,
  },
  content: {
    flex: 1,
  },
  welcomeContainer: {
    flex: 1,
  },
  welcomeContent: {
    padding: 24,
    alignItems: 'center',
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2E7D32',
    marginTop: 16,
    textAlign: 'center',
  },
  welcomeText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 24,
  },
  featuresTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2E7D32',
    marginTop: 24,
    marginBottom: 12,
  },
  featuresList: {
    alignItems: 'flex-start',
    width: '100%',
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    width: '100%',
  },
  featureText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 12,
    flex: 1,
  },
  quickPromptsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2E7D32',
    marginTop: 24,
    marginBottom: 12,
  },
  quickPrompts: {
    width: '100%',
  },
  quickPromptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#4CAF50',
  },
  quickPromptText: {
    fontSize: 14,
    color: '#333',
    marginLeft: 12,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
  },
  messageContainer: {
    marginBottom: 16,
  },
  userMessage: {
    alignItems: 'flex-end',
  },
  aiMessage: {
    alignItems: 'flex-start',
  },
  messageBubble: {
    maxWidth: '85%',
    padding: 12,
    borderRadius: 16,
  },
  userBubble: {
    backgroundColor: '#4CAF50',
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 4,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
  },
  imageContainer: {
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    padding: 8,
    borderRadius: 8,
    marginBottom: 8,
  },
  imageLabel: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: 'bold',
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  userMessageText: {
    color: '#FFFFFF',
  },
  aiMessageText: {
    color: '#333',
  },
  languageIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(102, 102, 102, 0.2)',
  },
  languageText: {
    fontSize: 10,
    color: '#666',
    marginLeft: 4,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  loadingText: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
  imagePreview: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#E8F5E8',
    padding: 12,
    marginHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  imagePreviewText: {
    fontSize: 14,
    color: '#2E7D32',
    fontWeight: '500',
  },
  inputContainer: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  imageButton: {
    padding: 8,
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 14,
    maxHeight: 80,
    backgroundColor: '#F9F9F9',
  },
  sendButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 20,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  languageModal: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    width: '80%',
    maxHeight: '70%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 20,
  },
  languageOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 4,
  },
  selectedLanguageOption: {
    backgroundColor: '#E8F5E8',
  },
  languageFlag: {
    fontSize: 20,
    marginRight: 12,
  },
  languageName: {
    fontSize: 16,
    color: '#333',
    flex: 1,
  },
  closeModalButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  closeModalText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});