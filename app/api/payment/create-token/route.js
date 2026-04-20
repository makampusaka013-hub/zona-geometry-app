import { NextResponse } from 'next/server';
import midtransClient from 'midtrans-client';
import { createClient } from '@supabase/supabase-js';

// Initialize Midtrans Snap client dynamically
const snap = new midtransClient.Snap({
  isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
  serverKey: process.env.MIDTRANS_SERVER_KEY?.trim(),
  clientKey: process.env.MIDTRANS_CLIENT_KEY?.trim(),
});

export async function POST(request) {
  try {
    const { userId, userEmail, fullName, plan } = await request.json();

    if (!userId || !userEmail) {
      console.error('Payment API: Missing user data');
      return NextResponse.json({ error: 'Data user tidak lengkap' }, { status: 400 });
    }

    // Deteksi URL dasar secara dinamis
    const host = request.headers.get('host');
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const siteUrl = `${protocol}://${host}`;

    // Tentukan harga berdasarkan plan
    const planConfig = {
      advance: { amount: 499000, name: 'Advance', id: 'ADVANCE-MONTHLY', prefix: 'ZPA' },
      pro:     { amount: 299000, name: 'Pro',     id: 'PRO-MONTHLY',     prefix: 'ZPP' },
      normal:  { amount: 29000,  name: 'Normal',  id: 'NORMAL-MONTHLY',  prefix: 'ZPN' },
    };

    const config = planConfig[plan] || planConfig.normal;

    // Build a secure and valid order_id (Midtrans max 50 chars)
    // Format: PRE-UUIDSHORT-TIMESTAMP (approx 25-30 chars)
    const shortUserId = userId.split('-')[0]; // Ambil bagian pertama UUID agar hemat karakter
    const timestamp = Date.now();
    const orderId = `${config.prefix}-${shortUserId}-${timestamp}`;

    console.log(`Creating transaction for user ${userId}, plan ${plan}, orderId ${orderId}, mode: ${process.env.MIDTRANS_IS_PRODUCTION === 'true' ? 'Production' : 'Sandbox'}`);

    // Parameters for Midtrans Snap
    const parameter = {
      transaction_details: {
        order_id: orderId,
        gross_amount: config.amount,
      },
      custom_field1: userId,
      custom_field2: plan, 
      custom_field3: userEmail,
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
        finish: `${siteUrl}/dashboard?payment=success&order_id=${orderId}`,
        error: `${siteUrl}/dashboard?payment=error`,
        pending: `${siteUrl}/dashboard?payment=pending&order_id=${orderId}`,
      }
    };

    const transaction = await snap.createTransaction(parameter);
    
    return NextResponse.json({ 
      token: transaction.token,
      redirect_url: transaction.redirect_url 
    });

  } catch (error) {
    console.error('Error creating Midtrans transaction:', error);
    // Jika error karena kunci tidak valid atau masalah koneksi
    return NextResponse.json({ 
      error: 'Gagal membuat transaksi: ' + (error.message || 'Error internal'),
      details: error.message 
    }, { status: 500 });
  }
}
