import { initializeApp } from 'firebase/app'
import { getDatabase } from 'firebase/database'

const firebaseConfig = {
  apiKey: 'AIzaSyAw7sgwP4Q5cxz8z7N4Y8g5_BB7hdgzWG8',
  authDomain: 'starmind-72daa.firebaseapp.com',
  databaseURL: 'https://starmind-72daa-default-rtdb.firebaseio.com',
  projectId: 'starmind-72daa',
  storageBucket: 'starmind-72daa.firebasestorage.app',
  messagingSenderId: '372397827204',
  appId: '1:372397827204:web:721c4afb9dedd9caee8ed1',
  measurementId: 'G-ZJH1PCLQRE',
}

// Initialize Firebase
const app = initializeApp(firebaseConfig)

// Initialize Realtime Database
export const database = getDatabase(app)
