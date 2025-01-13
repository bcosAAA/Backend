import dotenv from 'dotenv';
import mongoose from 'mongoose';

// Load environment variables from .env file
dotenv.config();

// Define the MongoDB connection URI
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('MongoDB connection URI is not defined in environment variables.');
  process.exit(1);
}

// Configure Mongoose to use modern features and handle deprecation warnings
mongoose.set('strictQuery', true); // Suppress deprecation warning for `strictQuery`

const connectDB = async () => {
  try {
    // Attempt to connect to MongoDB
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 5000, // Timeout after 5 seconds if MongoDB is unreachable
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
    });

    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);

    // Gracefully exit the application if the connection fails
    process.exit(1);
  }
};

// Handle MongoDB connection events
mongoose.connection.on('connected', () => {
  console.log('Mongoose connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
  console.error('Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('Mongoose disconnected from MongoDB');
});

// Gracefully close the MongoDB connection on application termination
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('Mongoose connection closed due to application termination');
  process.exit(0);
});

export default connectDB;