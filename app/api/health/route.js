import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';

export async function GET() {
  try {
    // Check database connection
    const client = await clientPromise;
    await client.db().admin().ping();
    
    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        api: 'up',
        database: 'up'
      },
      version: '1.0.0'
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        services: {
          api: 'up',
          database: 'down'
        },
        error: error.message
      },
      { status: 503 }
    );
  }
}
