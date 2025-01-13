import { Document, Schema, model } from 'mongoose';
import bcrypt from 'bcrypt';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Define the IUser interface
export interface IUser extends Document {
  email: string;
  password?: string;
  role: string;
  name?: string;
  loginAttempts: {
    count: number;
    lastAttempt?: Date;
  };
  verificationCode?: string | null;
  verificationCodeExpires?: Date;
  comparePassword(password: string): Promise<boolean>;
  googleId?: string;
  lastLogin?: Date;
  apiKey?: string;
  resetToken?: string;
  resetTokenExpires?: Date;
  authProvider?: string;
  profilePicture?: string;
  credits: number;
  creditHistory: {
    amount: number;
    action: string;
    toolName: string;
    timestamp: Date;
  }[];
}

const userSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true },
    password: { type: String },
    role: { type: String, default: 'user' },
    name: { type: String },
    loginAttempts: {
      count: { type: Number, default: 0 },
      lastAttempt: { type: Date },
    },
    verificationCode: { type: String },
    verificationCodeExpires: { type: Date },
    googleId: { type: String },
    lastLogin: { type: Date },
    apiKey: { type: String },
    resetToken: { type: String },
    resetTokenExpires: { type: Date },
    authProvider: { type: String },
    profilePicture: { type: String },
    credits: {
      type: Number,
      default: 100, // Start with 100 credits
      min: 0,
    },
    creditHistory: [
      {
        amount: Number,
        action: {
          type: String,
          enum: ['deduction', 'addition'],
        },
        toolName: String,
        timestamp: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Fixed pre-save middleware for password hashing
userSchema.pre<IUser>('save', async function (next) {
  try {
    if (this.isModified('password')) {
      // Type assertion to handle the optional password
      const password = this.password as string | undefined;

      // Only hash if password exists
      if (password) {
        const hashedPassword = await bcrypt.hash(password, 12);
        this.password = hashedPassword;
      }
    }
    next();
  } catch (error) {
    next(error as Error);
  }
});

// Fixed comparePassword method
userSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  try {
    // Type assertion for password
    const password = this.password as string | undefined;

    if (!password) {
      return false;
    }

    return await bcrypt.compare(candidatePassword, password);
  } catch (error) {
    throw new Error('Password comparison failed');
  }
};

const User = model<IUser>('User', userSchema);

export default User;

