// src/models/AutomatedBlog.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface IAutomatedBlog extends Document {
  title: string;
  content: string;
  featuredImage: string;
  seoMetadata: {
    metaTitle: string;
    metaDescription: string;
    keywords: string[];
    canonicalUrl?: string;
  };
  externalLinks: Array<{
    url: string;
    anchor: string;
    rel: string;
  }>;
  status: 'draft' | 'published';
  author: mongoose.Types.ObjectId;
  category: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}

const AutomatedBlogSchema: Schema = new Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  content: {
    type: String,
    required: true,
  },
  featuredImage: {
    type: String,
    required: true,
  },
  seoMetadata: {
    metaTitle: { type: String, required: true },
    metaDescription: { type: String, required: true },
    keywords: [{ type: String }],
    canonicalUrl: { type: String },
  },
  externalLinks: [{
    url: { type: String, required: true },
    anchor: { type: String, required: true },
    rel: { type: String, default: 'nofollow' },
  }],
  status: {
    type: String,
    enum: ['draft', 'published'],
    default: 'draft',
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  category: {
    type: String,
    required: true,
  },
  slug: {
    type: String,
    required: true,
    unique: true,
  },
}, {
  timestamps: true,
});

export default mongoose.model<IAutomatedBlog>('AutomatedBlog', AutomatedBlogSchema);