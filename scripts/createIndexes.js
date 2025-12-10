// Database Indexes Creation Script
// Run this once to create all necessary indexes for optimal performance

const { MongoClient } = require('mongodb');

const uri = process.env.MONGO_URL || 'mongodb://localhost:27017/workspace_collaboration';

async function createIndexes() {
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db();
    
    // Users collection indexes
    console.log('\n📊 Creating indexes for users collection...');
    await db.collection('users').createIndex({ email: 1 }, { unique: true });
    await db.collection('users').createIndex({ id: 1 }, { unique: true });
    await db.collection('users').createIndex({ role: 1 });
    await db.collection('users').createIndex({ divisionId: 1 });
    console.log('✅ Users indexes created');
    
    // Jobdesks collection indexes
    console.log('\n📊 Creating indexes for jobdesks collection...');
    await db.collection('jobdesks').createIndex({ id: 1 }, { unique: true });
    await db.collection('jobdesks').createIndex({ assignedTo: 1 });
    await db.collection('jobdesks').createIndex({ createdBy: 1 });
    await db.collection('jobdesks').createIndex({ status: 1 });
    await db.collection('jobdesks').createIndex({ dueDate: 1 });
    console.log('✅ Jobdesks indexes created');
    
    // Daily logs collection indexes
    console.log('\n📊 Creating indexes for daily_logs collection...');
    await db.collection('daily_logs').createIndex({ id: 1 }, { unique: true });
    await db.collection('daily_logs').createIndex({ userId: 1, date: -1 });
    await db.collection('daily_logs').createIndex({ jobdeskId: 1 });
    await db.collection('daily_logs').createIndex({ date: -1 });
    console.log('✅ Daily logs indexes created');
    
    // Todos collection indexes
    console.log('\n📊 Creating indexes for todos collection...');
    await db.collection('todos').createIndex({ id: 1 }, { unique: true });
    await db.collection('todos').createIndex({ userId: 1, status: 1 });
    await db.collection('todos').createIndex({ jobdeskId: 1 });
    await db.collection('todos').createIndex({ dueDate: 1 });
    await db.collection('todos').createIndex({ status: 1 });
    console.log('✅ Todos indexes created');
    
    // Notifications collection indexes
    console.log('\n📊 Creating indexes for notifications collection...');
    await db.collection('notifications').createIndex({ id: 1 }, { unique: true });
    await db.collection('notifications').createIndex({ userId: 1, read: 1 });
    await db.collection('notifications').createIndex({ createdAt: -1 });
    console.log('✅ Notifications indexes created');
    
    // Chat rooms collection indexes
    console.log('\n📊 Creating indexes for chat_rooms collection...');
    await db.collection('chat_rooms').createIndex({ id: 1 }, { unique: true });
    await db.collection('chat_rooms').createIndex({ members: 1 });
    await db.collection('chat_rooms').createIndex({ createdAt: -1 });
    console.log('✅ Chat rooms indexes created');
    
    // Chat messages collection indexes
    console.log('\n📊 Creating indexes for chat_messages collection...');
    await db.collection('chat_messages').createIndex({ id: 1 }, { unique: true });
    await db.collection('chat_messages').createIndex({ roomId: 1, timestamp: -1 });
    await db.collection('chat_messages').createIndex({ senderId: 1 });
    console.log('✅ Chat messages indexes created');
    
    // Divisions collection indexes
    console.log('\n📊 Creating indexes for divisions collection...');
    await db.collection('divisions').createIndex({ id: 1 }, { unique: true });
    await db.collection('divisions').createIndex({ name: 1 }, { unique: true });
    console.log('✅ Divisions indexes created');
    
    // Attachments collection indexes (if exists)
    console.log('\n📊 Creating indexes for attachments collection...');
    await db.collection('attachments').createIndex({ id: 1 }, { unique: true });
    await db.collection('attachments').createIndex({ jobdeskId: 1 });
    await db.collection('attachments').createIndex({ uploadedBy: 1 });
    console.log('✅ Attachments indexes created');
    
    console.log('\n🎉 All indexes created successfully!');
    
    // List all indexes
    console.log('\n📋 Verifying indexes...');
    const collections = await db.listCollections().toArray();
    for (const collection of collections) {
      const indexes = await db.collection(collection.name).indexes();
      console.log(`\n${collection.name}:`, indexes.length, 'indexes');
      indexes.forEach(idx => {
        console.log('  -', idx.name);
      });
    }
    
  } catch (error) {
    console.error('❌ Error creating indexes:', error);
    process.exit(1);
  } finally {
    await client.close();
    console.log('\n✅ Database connection closed');
  }
}

createIndexes();
