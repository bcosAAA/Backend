import mongoose from 'mongoose';

const generatedBlogSchema = new mongoose.Schema({
  topic: { type: String, required: true },
  tone: { type: String, required: true },
  length: { type: String, required: true },
  title: { type: String, required: true },
  content: { type: String, required: true },
  excerpt: { type: String, required: true },
  tags: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now },
});

const GeneratedBlog = mongoose.model('GeneratedBlog', generatedBlogSchema);

export default GeneratedBlog;
