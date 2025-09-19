import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" backgroundColor="#2E7D32" />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: '#2E7D32',
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}
      >
        <Stack.Screen 
          name="index" 
          options={{ 
            title: 'DigiFarmer',
            headerShown: false 
          }} 
        />
        <Stack.Screen 
          name="market" 
          options={{ 
            title: 'Market Prices',
            presentation: 'modal'
          }} 
        />
        <Stack.Screen 
          name="crops" 
          options={{ 
            title: 'Crop Recommendations'
          }} 
        />
        <Stack.Screen 
          name="disease" 
          options={{ 
            title: 'Disease Detection'
          }} 
        />
        <Stack.Screen 
          name="profit" 
          options={{ 
            title: 'Profit Calculator'
          }} 
        />
      </Stack>
    </>
  );
}