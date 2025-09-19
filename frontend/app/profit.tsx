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
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BACKEND_URL = Constants.expoConfig?.extra?.EXPO_BACKEND_URL || process.env.EXPO_PUBLIC_BACKEND_URL;

interface ProfitAnalysis {
  crop: string;
  area: number;
  location: string;
  profit_analysis: string;
  timestamp: string;
}

interface CostBreakdown {
  seeds: number;
  fertilizer: number;
  irrigation: number;
  labor: number;
  pesticides: number;
  equipment: number;
  transportation: number;
  total: number;
}

export default function ProfitScreen() {
  const params = useLocalSearchParams();
  const { cropName, currentPrice, location } = params;

  const [area, setArea] = useState('');
  const [loading, setLoading] = useState(false);
  const [profitAnalysis, setProfitAnalysis] = useState<ProfitAnalysis | null>(null);
  const [costBreakdown, setCostBreakdown] = useState<CostBreakdown>({
    seeds: 0,
    fertilizer: 0,
    irrigation: 0,
    labor: 0,
    pesticides: 0,
    equipment: 0,
    transportation: 0,
    total: 0,
  });
  const [expectedYield, setExpectedYield] = useState('');
  const [marketPrice, setMarketPrice] = useState(currentPrice?.toString() || '');

  // Mock cost data per acre for different crops
  const mockCostData: { [key: string]: CostBreakdown } = {
    Rice: {
      seeds: 3000,
      fertilizer: 8000,
      irrigation: 12000,
      labor: 15000,
      pesticides: 4000,
      equipment: 6000,
      transportation: 2000,
      total: 50000,
    },
    Wheat: {
      seeds: 2500,
      fertilizer: 7000,
      irrigation: 8000,
      labor: 12000,
      pesticides: 3000,
      equipment: 5000,
      transportation: 1500,
      total: 39000,
    },
    Cotton: {
      seeds: 4000,
      fertilizer: 12000,
      irrigation: 15000,
      labor: 18000,
      pesticides: 8000,
      equipment: 8000,
      transportation: 3000,
      total: 68000,
    },
  };

  const yieldData: { [key: string]: number } = {
    Rice: 25, // quintals per acre
    Wheat: 20,
    Cotton: 15,
    Maize: 22,
    Sugarcane: 350,
    Soybean: 12,
  };

  useEffect(() => {
    if (cropName) {
      const costs = mockCostData[cropName as string] || mockCostData.Rice;
      setCostBreakdown(costs);
      const yield_per_acre = yieldData[cropName as string] || 20;
      setExpectedYield(yield_per_acre.toString());
    }
  }, [cropName]);

  const calculateProfit = async () => {
    if (!area || !expectedYield || !marketPrice) {
      Alert.alert('Error', 'Please fill all required fields');
      return;
    }

    try {
      setLoading(true);

      // Calculate basic profit
      const areaFloat = parseFloat(area);
      const yieldFloat = parseFloat(expectedYield);
      const priceFloat = parseFloat(marketPrice);
      
      const totalCost = costBreakdown.total * areaFloat;
      const totalYield = yieldFloat * areaFloat;
      const totalRevenue = totalYield * priceFloat * 100; // Convert quintals to kg
      const netProfit = totalRevenue - totalCost;
      
      // Get AI analysis
      const response = await fetch(`${BACKEND_URL}/api/market/predict-profit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          crop_name: cropName,
          area_acres: areaFloat,
          location: location,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setProfitAnalysis(data);
      } else {
        // Fallback analysis
        const mockAnalysis: ProfitAnalysis = {
          crop: cropName as string,
          area: areaFloat,
          location: location as string,
          profit_analysis: `**Profit Analysis for ${cropName}**

**Basic Calculations:**
- Total Area: ${area} acres
- Expected Yield: ${yieldFloat} quintals/acre
- Current Market Price: ₹${marketPrice}/kg
- Total Production: ${totalYield} quintals

**Cost Breakdown (₹${totalCost.toLocaleString()}):**
- Seeds: ₹${(costBreakdown.seeds * areaFloat).toLocaleString()}
- Fertilizer: ₹${(costBreakdown.fertilizer * areaFloat).toLocaleString()}
- Irrigation: ₹${(costBreakdown.irrigation * areaFloat).toLocaleString()}
- Labor: ₹${(costBreakdown.labor * areaFloat).toLocaleString()}
- Pesticides: ₹${(costBreakdown.pesticides * areaFloat).toLocaleString()}
- Equipment: ₹${(costBreakdown.equipment * areaFloat).toLocaleString()}
- Transportation: ₹${(costBreakdown.transportation * areaFloat).toLocaleString()}

**Revenue Analysis:**
- Total Revenue: ₹${totalRevenue.toLocaleString()}
- Total Cost: ₹${totalCost.toLocaleString()}
- **Net Profit: ₹${netProfit.toLocaleString()}**
- Profit Margin: ${((netProfit / totalRevenue) * 100).toFixed(1)}%

**Recommendations:**
${netProfit > 0 ? 
  '✅ This crop shows positive profit potential. Consider factors like weather, disease risk, and market volatility.' : 
  '⚠️ Current projections show potential loss. Consider crop alternatives or cost optimization.'
}

**Risk Factors:**
- Weather dependency
- Market price fluctuations
- Pest and disease risks
- Input cost variations

*Note: Prices fluctuate regularly. Check current market rates before making decisions.*`,
          timestamp: new Date().toISOString(),
        };
        setProfitAnalysis(mockAnalysis);
      }

      // Save to local storage for offline access
      const savedAnalyzes = await AsyncStorage.getItem('profit_analyses') || '[]';
      const analyses = JSON.parse(savedAnalyzes);
      analyses.unshift(mockAnalysis);
      await AsyncStorage.setItem('profit_analyses', JSON.stringify(analyses.slice(0, 10))); // Keep last 10

    } catch (error) {
      console.error('Error calculating profit:', error);
      Alert.alert('Error', 'Failed to calculate profit. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const renderCostItem = (label: string, value: number, icon: keyof typeof Ionicons.glyphMap) => (
    <View style={styles.costItem}>
      <View style={styles.costItemLeft}>
        <Ionicons name={icon} size={20} color="#2E7D32" />
        <Text style={styles.costLabel}>{label}</Text>
      </View>
      <Text style={styles.costValue}>₹{(value * parseFloat(area || '1')).toLocaleString()}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.header}>
          <Text style={styles.title}>Profit Calculator</Text>
          <Text style={styles.subtitle}>
            {cropName} - {location}
          </Text>
        </View>

        <View style={styles.inputSection}>
          <Text style={styles.sectionTitle}>Farm Details</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Area (acres) *</Text>
            <TextInput
              style={styles.input}
              value={area}
              onChangeText={setArea}
              placeholder="Enter area in acres"
              keyboardType="numeric"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Expected Yield (quintals/acre) *</Text>
            <TextInput
              style={styles.input}
              value={expectedYield}
              onChangeText={setExpectedYield}
              placeholder="Expected yield per acre"
              keyboardType="numeric"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Market Price (₹/kg) *</Text>
            <TextInput
              style={styles.input}
              value={marketPrice}
              onChangeText={setMarketPrice}
              placeholder="Current market price"
              keyboardType="numeric"
            />
          </View>
        </View>

        {area && (
          <View style={styles.costSection}>
            <Text style={styles.sectionTitle}>Cost Breakdown (for {area} acres)</Text>
            <View style={styles.costBreakdown}>
              {renderCostItem('Seeds', costBreakdown.seeds, 'leaf-outline')}
              {renderCostItem('Fertilizer', costBreakdown.fertilizer, 'flask-outline')}
              {renderCostItem('Irrigation', costBreakdown.irrigation, 'water-outline')}
              {renderCostItem('Labor', costBreakdown.labor, 'people-outline')}
              {renderCostItem('Pesticides', costBreakdown.pesticides, 'shield-outline')}
              {renderCostItem('Equipment', costBreakdown.equipment, 'hammer-outline')}
              {renderCostItem('Transportation', costBreakdown.transportation, 'car-outline')}
              
              <View style={[styles.costItem, styles.totalCost]}>
                <View style={styles.costItemLeft}>
                  <Ionicons name="calculator" size={20} color="#FFFFFF" />
                  <Text style={[styles.costLabel, { color: '#FFFFFF' }]}>Total Cost</Text>
                </View>
                <Text style={[styles.costValue, { color: '#FFFFFF' }]}>
                  ₹{(costBreakdown.total * parseFloat(area || '1')).toLocaleString()}
                </Text>
              </View>
            </View>
          </View>
        )}

        <TouchableOpacity
          style={[styles.calculateButton, { opacity: loading ? 0.6 : 1 }]}
          onPress={calculateProfit}
          disabled={loading}
        >
          <Ionicons name="analytics" size={24} color="#FFFFFF" />
          <Text style={styles.calculateButtonText}>
            {loading ? 'Calculating...' : 'Calculate Profit'}
          </Text>
        </TouchableOpacity>

        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#4CAF50" />
            <Text style={styles.loadingText}>Analyzing profit potential...</Text>
          </View>
        )}

        {profitAnalysis && (
          <View style={styles.resultSection}>
            <Text style={styles.sectionTitle}>Profit Analysis</Text>
            <View style={styles.analysisCard}>
              <Text style={styles.analysisText}>{profitAnalysis.profit_analysis}</Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
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
  inputSection: {
    backgroundColor: '#FFFFFF',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#F9F9F9',
  },
  costSection: {
    backgroundColor: '#FFFFFF',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  costBreakdown: {
    marginTop: 8,
  },
  costItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#F9F9F9',
    borderRadius: 8,
    marginBottom: 8,
  },
  costItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  costLabel: {
    fontSize: 14,
    color: '#333',
    marginLeft: 12,
  },
  costValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2E7D32',
  },
  totalCost: {
    backgroundColor: '#2E7D32',
    marginTop: 8,
  },
  calculateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  calculateButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginLeft: 8,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  loadingText: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
  },
  resultSection: {
    backgroundColor: '#FFFFFF',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  analysisCard: {
    backgroundColor: '#F9FFF9',
    padding: 16,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  analysisText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#333',
  },
});