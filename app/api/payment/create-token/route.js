import { NextResponse } from 'next/server';
import midtransClient from 'midtrans-client';
import { createClient } from '@supabase/supabase-js';

// Initialize Midtrans Snap client
const snap = new midtransClient.Snap({
  isProduction: false, // Always false for sandbox
  serverKey: process.env.MIDTRANS_SERVER_KEY,
  clientKey: process.env.MIDTRANS_CLIENT_KEY,
});

export async function POST(request) {
  try {
    const { userId, userEmail, fullName, plan } = await request.json();

    if (!userId || !userEmail) {
      return NextResponse.json({ error: 'Missing user data' }, { status: 400 });
    }

    // Tentukan harga berdasarkan plan
    const planConfig = {
      advance: { amount: 499000, name: 'Advance', id: 'ADVANCE-MONTHLY', prefix: 'ZPA' },
      pro:     { amount: 299000, name: 'Pro',     id: 'PRO-MONTHLY',     prefix: 'ZPP' },
      normal:  { amount: 29000,  name: 'Normal',  id: 'NORMAL-MONTHLY',  prefix: 'ZPN' },
    };

    const config = planConfig[plan] || planConfig.normal;

    // Build a secure order_id that includes the userId (UUID is 36 chars)
    // Format: PRE-USERID-TIME (approx 48 chars)
    const shortTime = Math.floor(Date.now() / 1000).toString().slice(-6);
    const orderId = `${config.prefix}-${userId}-${shortTime}`;

    // Parameters for Midtrans Snap
    const parameter = {
      transaction_details: {
        order_id: orderId,
        gross_amount: config.amount,
      },
      custom_field1: userId,
      custom_field2: plan, // Store the plan type so notification webhook knows which role to set
      customer_details: {
        first_name: fullName || 'User',
        email: userEmail,
      },
      usage_limit: 1,
      enabled_payments: ["qris", "bank_transfer", "gopay", "shopeepay"],
      item_details: [{
        id: config.id,
        price: config.amount,
        quantity: 1,
        name: `Zona Geometry ${config.name} - 30 Hari`,
      }],
      callbacks: {
        finish: `${process.env.APP_URL}/dashboard?payment=success`,
        error: `${process.env.APP_URL}/dashboard?payment=error`,
        pending: `${process.env.APP_URL}/dashboard?payment=pending`,
      }
    };

    const transaction = await snap.createTransaction(parameter);
    
    return NextResponse.json({ 
      token: transaction.token,
      redirect_url: transaction.redirect_url 
    });

  } catch (error) {
    console.error('Error creating Midtrans transaction:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
