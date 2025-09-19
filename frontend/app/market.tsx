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
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';

const BACKEND_URL = Constants.expoConfig?.extra?.EXPO_BACKEND_URL || process.env.EXPO_PUBLIC_BACKEND_URL;

interface MarketPrice {
  id: string;
  crop_name: string;
  price_per_kg: number;
  market_name: string;
  location: string;
  timestamp: string;
}

interface PriceAlert {
  crop: string;
  targetPrice: number;
  isAbove: boolean;
}

export default function MarketScreen() {
  const [prices, setPrices] = useState<MarketPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCrop, setSelectedCrop] = useState<string | null>(null);
  const [priceAlerts, setPriceAlerts] = useState<PriceAlert[]>([]);
  const [showAddAlert, setShowAddAlert] = useState(false);
  const [newAlert, setNewAlert] = useState({ crop: '', targetPrice: '', isAbove: true });

  // Mock market data - In real app, this would come from APIs like eNAM
  const mockMarketData: MarketPrice[] = [
    {
      id: '1',
      crop_name: 'Rice',
      price_per_kg: 25.50,
      market_name: 'Ludhiana Mandi',
      location: 'Punjab',
      timestamp: new Date().toISOString(),
    },
    {
      id: '2',
      crop_name: 'Wheat',
      price_per_kg: 22.00,
      market_name: 'Delhi Mandi',
      location: 'Delhi',
      timestamp: new Date().toISOString(),
    },
    {
      id: '3',
      crop_name: 'Cotton',
      price_per_kg: 55.75,
      market_name: 'Ahmedabad Mandi',
      location: 'Gujarat',
      timestamp: new Date().toISOString(),
    },
    {
      id: '4',
      crop_name: 'Sugarcane',
      price_per_kg: 3.25,
      market_name: 'Muzaffarnagar Mandi',
      location: 'Uttar Pradesh',
      timestamp: new Date().toISOString(),
    },
    {
      id: '5',
      crop_name: 'Maize',
      price_per_kg: 18.50,
      market_name: 'Bangalore Mandi',
      location: 'Karnataka',
      timestamp: new Date().toISOString(),
    },
    {
      id: '6',
      crop_name: 'Soybean',
      price_per_kg: 42.00,
      market_name: 'Indore Mandi',
      location: 'Madhya Pradesh',
      timestamp: new Date().toISOString(),
    },
  ];

  useEffect(() => {
    loadMarketData();
    loadPriceAlerts();
  }, []);

  const loadMarketData = async () => {
    try {
      setLoading(true);
      
      // Try to load from cache first (offline support)
      const cachedData = await AsyncStorage.getItem('market_prices');
      if (cachedData) {
        setPrices(JSON.parse(cachedData));
      }

      // For now, use mock data. In production, fetch from API
      // const response = await fetch(`${BACKEND_URL}/api/market/prices`);
      // const data = await response.json();
      
      const data = mockMarketData;
      setPrices(data);
      
      // Cache the data for offline access
      await AsyncStorage.setItem('market_prices', JSON.stringify(data));
      
    } catch (error) {
      console.error('Error loading market data:', error);
      // If online fetch fails, show cached data
      const cachedData = await AsyncStorage.getItem('market_prices');
      if (cachedData) {
        setPrices(JSON.parse(cachedData));
        Alert.alert('Offline Mode', 'Showing cached market prices');
      } else {
        Alert.alert('Error', 'Failed to load market prices');
      }
    } finally {
      setLoading(false);
    }
  };

  const loadPriceAlerts = async () => {
    try {
      const alerts = await AsyncStorage.getItem('price_alerts');
      if (alerts) {
        setPriceAlerts(JSON.parse(alerts));
      }
    } catch (error) {
      console.error('Error loading price alerts:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadMarketData();
    setRefreshing(false);
  };

  const filteredPrices = prices.filter(price =>
    price.crop_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    price.location.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const addPriceAlert = async () => {
    if (!newAlert.crop || !newAlert.targetPrice) {
      Alert.alert('Error', 'Please fill all fields');
      return;
    }

    const alert: PriceAlert = {
      crop: newAlert.crop,
      targetPrice: parseFloat(newAlert.targetPrice),
      isAbove: newAlert.isAbove,
    };

    const updatedAlerts = [...priceAlerts, alert];
    setPriceAlerts(updatedAlerts);
    await AsyncStorage.setItem('price_alerts', JSON.stringify(updatedAlerts));
    
    setNewAlert({ crop: '', targetPrice: '', isAbove: true });
    setShowAddAlert(false);
    Alert.alert('Success', 'Price alert added successfully!');
  };

  const navigateToProfit = (crop: MarketPrice) => {
    router.push({
      pathname: '/profit',
      params: { 
        cropName: crop.crop_name,
        currentPrice: crop.price_per_kg.toString(),
        location: crop.location
      }
    });
  };

  const renderPriceCard = (item: MarketPrice) => {
    const priceChange = Math.random() > 0.5 ? 1 : -1; // Mock price change
    const changePercent = (Math.random() * 10).toFixed(1);
    
    return (
      <TouchableOpacity
        key={item.id}
        style={styles.priceCard}
        onPress={() => setSelectedCrop(selectedCrop === item.crop_name ? null : item.crop_name)}
      >
        <View style={styles.priceHeader}>
          <View style={styles.cropInfo}>
            <Text style={styles.cropName}>{item.crop_name}</Text>
            <Text style={styles.marketName}>{item.market_name}</Text>
            <Text style={styles.location}>{item.location}</Text>
          </View>
          <View style={styles.priceInfo}>
            <Text style={styles.price}>₹{item.price_per_kg}/kg</Text>
            <View style={[styles.priceChange, { backgroundColor: priceChange > 0 ? '#4CAF50' : '#F44336' }]}>
              <Ionicons 
                name={priceChange > 0 ? 'trending-up' : 'trending-down'} 
                size={12} 
                color="#FFFFFF" 
              />
              <Text style={styles.priceChangeText}>{changePercent}%</Text>
            </View>
          </View>
        </View>
        
        {selectedCrop === item.crop_name && (
          <View style={styles.expandedInfo}>
            <View style={styles.actionButtons}>
              <TouchableOpacity 
                style={styles.actionButton}
                onPress={() => navigateToProfit(item)}
              >
                <Ionicons name="calculator" size={20} color="#2196F3" />
                <Text style={styles.actionButtonText}>Calculate Profit</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.actionButton}
                onPress={() => {
                  setNewAlert({ ...newAlert, crop: item.crop_name });
                  setShowAddAlert(true);
                }}
              >
                <Ionicons name="notifications" size={20} color="#FF9800" />
                <Text style={styles.actionButtonText}>Set Alert</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.lastUpdated}>
              Last Updated: {new Date(item.timestamp).toLocaleString()}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Loading market prices...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>Market Prices</Text>
          <Text style={styles.subtitle}>Real-time agricultural commodity prices</Text>
        </View>

        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#666" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search crops or locations..."
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        <View style={styles.alertsSection}>
          <View style={styles.alertsHeader}>
            <Text style={styles.alertsTitle}>Price Alerts ({priceAlerts.length})</Text>
            <TouchableOpacity onPress={() => setShowAddAlert(true)}>
              <Ionicons name="add-circle" size={24} color="#4CAF50" />
            </TouchableOpacity>
          </View>
          {priceAlerts.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {priceAlerts.map((alert, index) => (
                <View key={index} style={styles.alertCard}>
                  <Text style={styles.alertCrop}>{alert.crop}</Text>
                  <Text style={styles.alertCondition}>
                    {alert.isAbove ? '↗' : '↘'} ₹{alert.targetPrice}
                  </Text>
                </View>
              ))}
            </ScrollView>
          )}
        </View>

        <View style={styles.pricesSection}>
          <Text style={styles.sectionTitle}>Current Prices</Text>
          {filteredPrices.map(renderPriceCard)}
        </View>
      </ScrollView>

      {showAddAlert && (
        <View style={styles.modal}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Price Alert</Text>
            
            <TextInput
              style={styles.modalInput}
              placeholder="Crop name"
              value={newAlert.crop}
              onChangeText={(text) => setNewAlert({ ...newAlert, crop: text })}
            />
            
            <TextInput
              style={styles.modalInput}
              placeholder="Target price (₹/kg)"
              value={newAlert.targetPrice}
              onChangeText={(text) => setNewAlert({ ...newAlert, targetPrice: text })}
              keyboardType="numeric"
            />
            
            <View style={styles.alertTypeContainer}>
              <TouchableOpacity
                style={[styles.alertTypeButton, newAlert.isAbove && styles.alertTypeActive]}
                onPress={() => setNewAlert({ ...newAlert, isAbove: true })}
              >
                <Text style={styles.alertTypeText}>Above Price</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.alertTypeButton, !newAlert.isAbove && styles.alertTypeActive]}
                onPress={() => setNewAlert({ ...newAlert, isAbove: false })}
              >
                <Text style={styles.alertTypeText}>Below Price</Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowAddAlert(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.addButton]}
                onPress={addPriceAlert}
              >
                <Text style={styles.addButtonText}>Add Alert</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2E7D32',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    margin: 16,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
  },
  alertsSection: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  alertsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  alertsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  alertCard: {
    backgroundColor: '#FFF3E0',
    padding: 12,
    borderRadius: 8,
    marginRight: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
  },
  alertCrop: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#E65100',
  },
  alertCondition: {
    fontSize: 12,
    color: '#FF9800',
    marginTop: 4,
  },
  pricesSection: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  priceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  priceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cropInfo: {
    flex: 1,
  },
  cropName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  marketName: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  location: {
    fontSize: 12,
    color: '#999',
  },
  priceInfo: {
    alignItems: 'flex-end',
  },
  price: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2E7D32',
  },
  priceChange: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 4,
  },
  priceChangeText: {
    fontSize: 12,
    color: '#FFFFFF',
    marginLeft: 4,
  },
  expandedInfo: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  actionButtonText: {
    fontSize: 12,
    marginLeft: 4,
    color: '#333',
  },
  lastUpdated: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  },
  modal: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '90%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 20,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  alertTypeContainer: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  alertTypeButton: {
    flex: 1,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  alertTypeActive: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  alertTypeText: {
    fontSize: 14,
    color: '#333',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  cancelButton: {
    backgroundColor: '#F5F5F5',
  },
  addButton: {
    backgroundColor: '#4CAF50',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});