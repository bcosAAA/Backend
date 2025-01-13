export interface RegisterRequest {
  email: string;
  password: string;
  name?: string; // Make name optional
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface IUser {
  email: string;
  password: string;
  apiKey: string;
  role: string;
  loginAttempts: {
    count: number;
    lastAttempt: Date;
  };
  authProvider?: string;
  profilePicture?: string;
  verificationCode?: string;
  verificationCodeExpires?: Date;
}