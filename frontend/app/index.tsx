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
  StatusBar,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BACKEND_URL = Constants.expoConfig?.extra?.EXPO_BACKEND_URL || process.env.EXPO_PUBLIC_BACKEND_URL;

interface ChatMessage {
  id: string;
  message: string;
  response: string;
  timestamp: string;
  isUser: boolean;
}

interface QuickAction {
  id: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  route?: string;
}

export default function DigiFarmerHome() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId] = useState(() => Date.now().toString());
  const [isOnline, setIsOnline] = useState(true);

  const quickActions: QuickAction[] = [
    { id: '1', title: 'Crop Recommendation', icon: 'leaf-outline', color: '#4CAF50' },
    { id: '2', title: 'Market Prices', icon: 'trending-up-outline', color: '#2196F3', route: '/market' },
    { id: '3', title: 'Profit Calculator', icon: 'calculator-outline', color: '#FF9800', route: '/profit' },
    { id: '4', title: 'AI Chat Assistant', icon: 'chatbubbles-outline', color: '#9C27B0', route: '/ai-chat' },
  ];

  useEffect(() => {
    loadCachedMessages();
  }, []);

  const loadCachedMessages = async () => {
    try {
      const cached = await AsyncStorage.getItem(`chat_${sessionId}`);
      if (cached) {
        setMessages(JSON.parse(cached));
      }
    } catch (error) {
      console.error('Error loading cached messages:', error);
    }
  };

  const saveCachedMessages = async (newMessages: ChatMessage[]) => {
    try {
      await AsyncStorage.setItem(`chat_${sessionId}`, JSON.stringify(newMessages));
    } catch (error) {
      console.error('Error saving messages:', error);
    }
  };

  const sendMessage = async (message: string) => {
    if (!message.trim()) return;

    setIsLoading(true);
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      message,
      response: '',
      timestamp: new Date().toISOString(),
      isUser: true,
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
          message,
          session_id: sessionId,
          message_type: 'text',
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      const aiMessage: ChatMessage = {
        id: data.message_id,
        message: '',
        response: data.response,
        timestamp: new Date().toISOString(),
        isUser: false,
      };

      const finalMessages = [...updatedMessages, aiMessage];
      setMessages(finalMessages);
      await saveCachedMessages(finalMessages);
      setIsOnline(true);

    } catch (error) {
      console.error('Chat error:', error);
      setIsOnline(false);
      
      // Offline fallback response
      const offlineMessage: ChatMessage = {
        id: `offline_${Date.now()}`,
        message: '',
        response: "I'm currently offline, but I've saved your message. Here are some general farming tips: Check soil moisture regularly, monitor weather forecasts, and consider crop rotation for better yields. For specific advice, please try again when connected to the internet.",
        timestamp: new Date().toISOString(),
        isUser: false,
      };

      const offlineMessages = [...updatedMessages, offlineMessage];
      setMessages(offlineMessages);
      await saveCachedMessages(offlineMessages);
      
      Alert.alert('Offline Mode', 'Your message has been saved. I\'ll provide a full response when you\'re back online.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickAction = (action: QuickAction) => {
    if (action.route) {
      router.push(action.route as any);
      return;
    }

    let message = '';
    switch (action.id) {
      case '1':
        message = 'I need crop recommendations for my land. Can you help me with soil conditions, climate, and best crops to grow?';
        break;
      case '4':
        message = 'I think my crops might have a disease. Can you help me identify symptoms and suggest treatments?';
        break;
    }
    
    if (message) {
      sendMessage(message);
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
        <Text style={[
          styles.messageText,
          item.isUser ? styles.userMessageText : styles.aiMessageText
        ]}>
          {item.isUser ? item.message : item.response}
        </Text>
        {!item.isUser && !isOnline && item.id.includes('offline') && (
          <View style={styles.offlineIndicator}>
            <Ionicons name="cloud-offline" size={12} color="#FF9800" />
            <Text style={styles.offlineText}>Offline Response</Text>
          </View>
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#2E7D32" />
      
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Ionicons name="leaf" size={32} color="#FFFFFF" />
          <Text style={styles.headerTitle}>DigiFarmer</Text>
          <Text style={styles.headerSubtitle}>AI Agricultural Advisor</Text>
          {!isOnline && (
            <View style={styles.offlineHeader}>
              <Ionicons name="cloud-offline" size={16} color="#FF9800" />
              <Text style={styles.offlineHeaderText}>Offline Mode</Text>
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
              <Ionicons name="leaf" size={64} color="#4CAF50" />
              <Text style={styles.welcomeTitle}>Welcome to DigiFarmer!</Text>
              <Text style={styles.welcomeText}>
                Your AI-powered agricultural advisor. I can help you with crop recommendations, 
                market prices, profit calculations, and farming advice.
              </Text>
              <Text style={styles.quickActionsTitle}>Quick Actions:</Text>
              <View style={styles.quickActionsGrid}>
                {quickActions.map((action) => (
                  <TouchableOpacity
                    key={action.id}
                    style={[styles.quickActionButton, { borderColor: action.color }]}
                    onPress={() => handleQuickAction(action)}
                  >
                    <Ionicons name={action.icon} size={32} color={action.color} />
                    <Text style={styles.quickActionText}>{action.title}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              
              {/* Features Overview */}
              <View style={styles.featuresSection}>
                <Text style={styles.featuresTitle}>What I can help you with:</Text>
                <View style={styles.featuresList}>
                  <View style={styles.featureItem}>
                    <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
                    <Text style={styles.featureText}>Real-time market prices and trends</Text>
                  </View>
                  <View style={styles.featureItem}>
                    <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
                    <Text style={styles.featureText}>Profit calculations and cost analysis</Text>
                  </View>
                  <View style={styles.featureItem}>
                    <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
                    <Text style={styles.featureText}>Crop recommendations based on soil & climate</Text>
                  </View>
                  <View style={styles.featureItem}>
                    <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
                    <Text style={styles.featureText}>Disease identification and treatment</Text>
                  </View>
                  <View style={styles.featureItem}>
                    <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
                    <Text style={styles.featureText}>Offline support for rural areas</Text>
                  </View>
                </View>
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
                <Text style={styles.loadingText}>DigiFarmer is thinking...</Text>
              </View>
            )}
          </ScrollView>
        )}

        {/* Input Area */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.textInput}
            value={inputMessage}
            onChangeText={setInputMessage}
            placeholder="Ask about crops, diseases, market prices..."
            placeholderTextColor="#999"
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[styles.sendButton, { opacity: inputMessage.trim() ? 1 : 0.5 }]}
            onPress={() => sendMessage(inputMessage)}
            disabled={isLoading || !inputMessage.trim()}
          >
            <Ionicons name="send" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
    paddingHorizontal: 20,
    paddingVertical: 16,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  headerContent: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 8,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#E8F5E8',
    marginTop: 4,
  },
  offlineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: 'rgba(255, 152, 0, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  offlineHeaderText: {
    fontSize: 12,
    color: '#FF9800',
    marginLeft: 4,
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
    fontSize: 28,
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
  quickActionsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2E7D32',
    marginTop: 32,
    marginBottom: 16,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    width: '100%',
  },
  quickActionButton: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 2,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  quickActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    marginTop: 8,
  },
  featuresSection: {
    width: '100%',
    marginTop: 32,
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderRadius: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
  },
  featuresTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2E7D32',
    marginBottom: 16,
  },
  featuresList: {
    alignItems: 'flex-start',
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    width: '100%',
  },
  featureText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 12,
    flex: 1,
  },
  messagesContainer: {
    flex: 1,
    backgroundColor: '#F5F5F5',
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
    maxWidth: '80%',
    padding: 16,
    borderRadius: 20,
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
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  userMessageText: {
    color: '#FFFFFF',
  },
  aiMessageText: {
    color: '#333',
  },
  offlineIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  offlineText: {
    fontSize: 10,
    color: '#FF9800',
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
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  textInput: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    maxHeight: 100,
    marginRight: 12,
    backgroundColor: '#F9F9F9',
  },
  sendButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 20,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});