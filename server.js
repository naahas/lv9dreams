const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const cors = require('cors');
const nodemailer = require('nodemailer');
const { saveOrder, getStats, getRecentOrders, clearAllOrders } = require('./dbs');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const paypal = require('@paypal/checkout-server-sdk');



require('dotenv').config();


console.log("-------------------")
console.log('lv9dreams database is on');

// Main constants
const app = express();
const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
        credentials: true,
        allowedHeaders: ['Content-Type']
    }
});


let environment;
if (process.env.PAYPAL_MODE === 'live') {
    environment = new paypal.core.LiveEnvironment(
        process.env.PAYPAL_CLIENT_ID,
        process.env.PAYPAL_CLIENT_SECRET
    );
} else {
    environment = new paypal.core.SandboxEnvironment(
        process.env.PAYPAL_CLIENT_ID,
        process.env.PAYPAL_CLIENT_SECRET
    );
}

const paypalClient = new paypal.core.PayPalHttpClient(environment);


//mail configuration
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    },
});


const validateAdminKey = (req, res, next) => {
    const adminKey = req.headers['x-admin-key'];    
  
    if (adminKey !== process.env.ADMIN_KEY) {
        return res.status(401).json({ 
            success: false, 
            message: 'Unauthorized access' 
        });
    }
    next();
};


// Session middleware
const tmin = 60000; // 1 min
const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || 'fallback-secret-change-in-production',
    resave: true,
    saveUninitialized: true,
    cookie: {
        maxAge: 30 * tmin,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production' // HTTPS en production
    }
});

// Middlewares
app.use(cors());
app.use(express.static('src/html'));
app.use(express.static('src/style'));
app.use(express.static('src/script'));
app.use(express.static('src/img'));
app.use(sessionMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
io.engine.use(sessionMiddleware);

// Variables globales
let connectedUsers = new Map(); // Plus moderne que les arrays

// Routes
app.get('/', function(req, res) {
    res.sendFile(__dirname + '/src/html/home.html');
});


app.get('/admin', function(req, res) {
    res.sendFile(__dirname + '/src/html/admin.html');
});


app.get('/api/stripe-config', (req, res) => {
    res.json({
        success: true,
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY
    });
});

app.post('/api/create-paypal-order', async (req, res) => {
    try {
        const { amount, currency = 'EUR', orderData } = req.body;
        
        console.log('🅿️ Création commande PayPal:', { amount, currency });
        
        const request = new paypal.orders.OrdersCreateRequest();
        request.prefer("return=representation");
        request.requestBody({
            intent: 'CAPTURE',
            purchase_units: [{
                amount: {
                    currency_code: currency,
                    value: amount.toString()
                },
                description: `Commande LV9Dreams - ${orderData?.products?.length || 1} produit(s)`,
                custom_id: `LV9-${Date.now()}`,
                invoice_id: `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`
            }],
            application_context: {
                brand_name: 'LV9Dreams',
                landing_page: 'LOGIN',
                user_action: 'PAY_NOW',
                return_url: `${req.protocol}://${req.get('host')}/paypal-success`,
                cancel_url: `${req.protocol}://${req.get('host')}/paypal-cancel`
            }
        });
        
        const order = await paypalClient.execute(request);
        
        console.log('✅ Commande PayPal créée:', order.result.id);
        
        // Sauvegarder temporairement les données de commande
        const tempOrderData = {
            paypalOrderId: order.result.id,
            customer: orderData.customer,
            products: orderData.products,
            total: amount,
            timestamp: Date.now()
        };
        
        // Tu peux utiliser Redis, une DB temporaire, ou simplement le faire côté client
        // Pour simplifier, on va stocker côté client avec sessionStorage
        
        res.json({
            success: true,
            orderId: order.result.id,
            approvalUrl: order.result.links.find(link => link.rel === 'approve').href,
            tempOrderData: tempOrderData
        });
        
    } catch (error) {
        console.error('❌ Erreur création PayPal:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la création de la commande PayPal',
            error: error.message
        });
    }
});

// Route pour capturer le paiement PayPal
app.post('/api/capture-paypal-order', async (req, res) => {
    try {
        const { orderId, payerId } = req.body;
        
        console.log('🅿️ Capture paiement PayPal:', { orderId, payerId });
        
        const request = new paypal.orders.OrdersCaptureRequest(orderId);
        request.requestBody({});
        
        const capture = await paypalClient.execute(request);
        
        console.log('✅ Paiement PayPal capturé:', capture.result.status);
        
        if (capture.result.status === 'COMPLETED') {
            const captureDetails = capture.result.purchase_units[0].payments.captures[0];
            
            res.json({
                success: true,
                status: 'completed',
                captureId: captureDetails.id,
                amount: captureDetails.amount.value,
                currency: captureDetails.amount.currency_code,
                paypalOrderId: orderId
            });
        } else {
            throw new Error('Paiement non complété: ' + capture.result.status);
        }
        
    } catch (error) {
        console.error('❌ Erreur capture PayPal:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la capture du paiement',
            error: error.message
        });
    }
});

// Route pour les pages de retour PayPal
app.get('/paypal-success', (req, res) => {
    const { token, PayerID } = req.query;
    
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Paiement PayPal - Traitement</title>
            <style>
                body { 
                    font-family: Arial, sans-serif; 
                    display: flex; 
                    justify-content: center; 
                    align-items: center; 
                    min-height: 100vh; 
                    margin: 0;
                    background: #f8f9fa;
                }
                .container { 
                    text-align: center; 
                    padding: 2rem;
                    background: white;
                    border-radius: 8px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                }
                .spinner {
                    border: 4px solid #f3f3f3;
                    border-top: 4px solid #0070ba;
                    border-radius: 50%;
                    width: 40px;
                    height: 40px;
                    animation: spin 1s linear infinite;
                    margin: 0 auto 1rem;
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="spinner"></div>
                <h2>🅿️ Finalisation du paiement PayPal...</h2>
                <p>Veuillez patienter pendant que nous traitons votre paiement.</p>
            </div>
            
            <script>
                // Finaliser le paiement
                async function finalizePayment() {
                    try {
                        // Récupérer les données de commande temporaires
                        const tempData = sessionStorage.getItem('lv9_paypal_temp_order');
                        if (!tempData) {
                            throw new Error('Données de commande introuvables');
                        }
                        
                        const orderData = JSON.parse(tempData);
                        
                        // Capturer le paiement
                        const response = await fetch('/api/capture-paypal-order', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                orderId: '${token}',
                                payerId: '${PayerID}'
                            })
                        });
                        
                        const result = await response.json();
                        
                        if (result.success) {
                            // Sauvegarder la commande finale
                            const finalOrderData = {
                                customer: orderData.customer,
                                products: orderData.products,
                                subtotal: orderData.total,
                                shipping: 0,
                                total: orderData.total,
                                payment: {
                                    method: 'paypal',
                                    paypalOrderId: '${token}',
                                    payerId: '${PayerID}',
                                    captureId: result.captureId,
                                    amount: result.amount,
                                    currency: result.currency,
                                    status: 'completed'
                                },
                                orderDate: new Date().toISOString()
                            };
                            
                            const saveResponse = await fetch('/api/order', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(finalOrderData)
                            });
                            
                            const saveResult = await saveResponse.json();
                            
                            if (saveResult.success) {
                                // Nettoyer et rediriger
                                sessionStorage.removeItem('lv9_paypal_temp_order');
                                localStorage.removeItem('lv9dreams_cart');
                                localStorage.removeItem('lv9dreams_cart_count');
                                
                                alert('✅ Paiement PayPal réussi ! Commande confirmée.');
                                window.location.href = '/';
                            } else {
                                throw new Error('Erreur sauvegarde: ' + saveResult.message);
                            }
                        } else {
                            throw new Error('Erreur capture: ' + result.message);
                        }
                        
                    } catch (error) {
                        console.error('Erreur finalisation PayPal:', error);
                        alert('❌ Erreur lors de la finalisation: ' + error.message);
                        window.location.href = '/';
                    }
                }
                
                // Lancer la finalisation
                finalizePayment();
            </script>
        </body>
        </html>
    `);
});

app.get('/paypal-cancel', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Paiement PayPal - Annulé</title>
            <style>
                body { 
                    font-family: Arial, sans-serif; 
                    display: flex; 
                    justify-content: center; 
                    align-items: center; 
                    min-height: 100vh; 
                    margin: 0;
                    background: #f8f9fa;
                }
                .container { 
                    text-align: center; 
                    padding: 2rem;
                    background: white;
                    border-radius: 8px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>❌ Paiement PayPal annulé</h2>
                <p>Vous avez annulé le paiement. Aucun montant n'a été débité.</p>
                <button onclick="window.location.href='/'" style="
                    background: #0070ba; 
                    color: white; 
                    border: none; 
                    padding: 1rem 2rem; 
                    border-radius: 4px; 
                    cursor: pointer;
                    font-size: 1rem;
                ">Retour à la boutique</button>
            </div>
            
            <script>
                // Nettoyer les données temporaires
                sessionStorage.removeItem('lv9_paypal_temp_order');
            </script>
        </body>
        </html>
    `);
});


app.post('/api/create-payment-intent', async (req, res) => {
    try {
        const { amount, currency = 'eur', orderData } = req.body;
        
        console.log('💳 Création Payment Intent:', { amount, currency });
        
        // Créer le Payment Intent chez Stripe
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(amount * 100), // Stripe utilise les centimes
            currency: currency,
            payment_method_types: ['card'],
            metadata: {
                customer_email: orderData?.customer?.email || '',
                customer_name: `${orderData?.customer?.firstName || ''} ${orderData?.customer?.lastName || ''}`.trim(),
                products_count: orderData?.products?.length || 0
            }
        });
        
        console.log('✅ Payment Intent créé:', paymentIntent.id);
        
        res.json({
            success: true,
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id
        });
        
    } catch (error) {
        console.error('❌ Erreur Payment Intent:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la création du paiement',
            error: error.message
        });
    }
});


app.get('/api/admin/stats', validateAdminKey, async function(req, res) {
  
    
    try {
        console.log('📊 Récupération des statistiques admin...');
        
        // 🆕 NOUVELLES : Vraies stats depuis la DB
        const stats = await getStats();
        
        console.log('📈 Stats calculées:', {
            todayRevenue: stats.todayRevenue,
            todayOrders: stats.todayOrders,
            totalOrders: stats.totalOrders
        });
        
        res.json({
            success: true,
            data: {
                todayRevenue: stats.todayRevenue.toFixed(2),
                revenueChange: stats.revenueChange.toFixed(1),
                todayOrders: stats.todayOrders,
                totalOrders: stats.totalOrders,
                topProduct: stats.topProduct,
                averageCart: stats.averageCart.toFixed(2),
                conversionRate: stats.conversionRate.toFixed(1),
                salesData: stats.salesData.map(d => d.revenue || 0),
                productsData: stats.productsData.map(p => p.total_revenue || 0)
            }
        });
        
    } catch (error) {
        console.error('❌ Erreur stats admin:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur serveur' 
        });
    }
});

// API pour les commandes récentes
app.get('/api/admin/orders', validateAdminKey, async function(req, res) {
    
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        
        console.log(`📋 Récupération des commandes (page ${page}, limit ${limit})`);
        
        // 🆕 NOUVELLES : Vraies commandes depuis la DB
        const result = await getRecentOrders(limit, offset);
        
        console.log(`📦 ${result.orders.length} commandes récupérées`);
        
        res.json({
            success: true,
            data: result.orders,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(result.pagination.total / limit),
                totalOrders: result.pagination.total,
                hasMore: result.pagination.hasMore
            }
        });
        
    } catch (error) {
        console.error('❌ Erreur commandes admin:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur serveur' 
        });
    }
});



// Route pour récupérer les utilisateurs connectés
app.get('/api/users', function(req, res) {
    res.json({
        count: connectedUsers.size,
        users: Array.from(connectedUsers.values())
    });
});



app.delete('/api/admin/clear-orders', validateAdminKey, async function(req, res) {
    try {
        console.log('🗑️ SUPPRESSION DE TOUTES LES COMMANDES (Admin)');
        
        await clearAllOrders(); // Utilise la fonction Supabase
        
        res.json({
            success: true,
            message: 'Toutes les commandes supprimées avec succès'
        });
        
    } catch (error) {
        console.error('❌ Erreur suppression commandes:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur lors de la suppression' 
        });
    }
});

// Route pour supprimer seulement les commandes de test
app.delete('/api/admin/clear-test-orders', validateAdminKey, async function(req, res) {
    try {
        console.log('🧹 Suppression des commandes de test...');
        
        const { supabase } = require('./dbs'); // Import du client Supabase
        
        // Récupérer d'abord les commandes de test pour compter
        const { data: testOrders, error: selectError } = await supabase
            .from('orders')
            .select('order_id')
            .or(
                'customer_email.ilike.%test%,' +
                'customer_email.ilike.%demo%,' + 
                'customer_first_name.ilike.%test%,' +
                'customer_first_name.ilike.%julie%,' +
                'customer_first_name.ilike.%edgar%,' +
                'customer_last_name.ilike.%test%'
            );
        
        if (selectError) {
            console.error('❌ Erreur recherche commandes test:', selectError);
            throw selectError;
        }
        
        const testOrdersCount = testOrders?.length || 0;
        console.log(`🔍 ${testOrdersCount} commandes de test trouvées`);
        
        if (testOrdersCount === 0) {
            return res.json({
                success: true,
                message: 'Aucune commande de test à supprimer',
                deleted: 0
            });
        }
        
        // Supprimer d'abord les items des commandes de test
        const testOrderIds = testOrders.map(order => order.order_id);
        
        const { error: itemsError } = await supabase
            .from('order_items')
            .delete()
            .in('order_id', testOrderIds);
        
        if (itemsError) {
            console.error('❌ Erreur suppression items test:', itemsError);
            throw itemsError;
        }
        
        // Puis supprimer les commandes de test
        const { error: ordersError } = await supabase
            .from('orders')
            .delete()
            .or(
                'customer_email.ilike.%test%,' +
                'customer_email.ilike.%demo%,' + 
                'customer_first_name.ilike.%test%,' +
                'customer_first_name.ilike.%julie%,' +
                'customer_first_name.ilike.%edgar%,' +
                'customer_last_name.ilike.%test%'
            );
        
        if (ordersError) {
            console.error('❌ Erreur suppression commandes test:', ordersError);
            throw ordersError;
        }
        
        console.log(`✅ ${testOrdersCount} commandes de test supprimées de Supabase`);
        
        res.json({
            success: true,
            message: `${testOrdersCount} commandes de test supprimées`,
            deleted: testOrdersCount
        });
        
    } catch (error) {
        console.error('❌ Erreur suppression commandes test:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur lors de la suppression des commandes de test',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});


app.post('/api/admin/verify-password', (req, res) => {
    const { password } = req.body;
    
    if (password === process.env.ADMIN_KEY) {
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});


app.post('/api/order', async (req, res) => {
    try {
        const orderData = req.body;
        
        console.log('📦 Nouvelle commande reçue:');
        console.log('- Client:', orderData.customer.firstName, orderData.customer.lastName);
        console.log('- Email:', orderData.customer.email);
        
        // Affichage des informations de paiement
        if (orderData.payment) {
            console.log('💳 Mode de paiement:', orderData.payment.method);
            if (orderData.payment.method === 'stripe') {
                console.log('- Payment Intent ID:', orderData.payment.paymentIntentId);
            } else if (orderData.payment.method === 'card') {
                console.log('- Type de carte:', orderData.payment.cardBrand || 'Inconnue');
                console.log('- Fin de carte: ****', orderData.payment.cardLast4 || '????');
            }
        }
        
        // Calculer la quantité totale
        let totalQuantity = 0;
        if (orderData.products && orderData.products.length > 0) {
            console.log('- Produits commandés:');
            orderData.products.forEach((product, index) => {
                totalQuantity += product.quantity;
                console.log(`  ${index + 1}. ${product.name} x${product.quantity} - ${(product.price * product.quantity).toFixed(2)}€`);
            });
        }
        
        console.log('- Total:', orderData.total + '€');
        console.log('- Quantité totale:', totalQuantity);
        
        // Générer un ID de commande unique
        const orderId = 'LV9-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
        orderData.orderId = orderId;
        
        // 🆕 NOUVEAU : Vérifier le paiement Stripe si c'est un paiement Stripe
        if (orderData.payment && orderData.payment.method === 'stripe') {
            console.log('🔍 Vérification du paiement Stripe...');
            
            try {
                const paymentIntent = await stripe.paymentIntents.retrieve(
                    orderData.payment.paymentIntentId
                );
                
                console.log('💳 Statut Stripe:', paymentIntent.status);
                
                if (paymentIntent.status !== 'succeeded') {
                    console.log('❌ Paiement non confirmé:', paymentIntent.status);
                    return res.status(400).json({
                        success: false,
                        message: 'Le paiement n\'a pas été confirmé',
                        errorCode: 'PAYMENT_NOT_CONFIRMED',
                        paymentStatus: paymentIntent.status
                    });
                }
                
                // Vérifier le montant
                const expectedAmount = Math.round(parseFloat(orderData.total) * 100);
                if (paymentIntent.amount !== expectedAmount) {
                    console.log('❌ Montant incorrect:', { 
                        expected: expectedAmount, 
                        received: paymentIntent.amount 
                    });
                    return res.status(400).json({
                        success: false,
                        message: 'Montant du paiement incorrect',
                        errorCode: 'AMOUNT_MISMATCH'
                    });
                }
                
                console.log('✅ Paiement Stripe vérifié avec succès !');
                
                // Ajouter les infos Stripe aux données de commande
                orderData.payment.stripePaymentIntentId = paymentIntent.id;
                orderData.payment.stripeChargeId = paymentIntent.latest_charge;
                orderData.payment.cardLast4 = paymentIntent.charges?.data?.[0]?.payment_method_details?.card?.last4;
                orderData.payment.cardBrand = paymentIntent.charges?.data?.[0]?.payment_method_details?.card?.brand;
                
            } catch (stripeError) {
                console.error('❌ Erreur vérification Stripe:', stripeError);
                return res.status(400).json({
                    success: false,
                    message: 'Erreur lors de la vérification du paiement',
                    errorCode: 'STRIPE_VERIFICATION_ERROR'
                });
            }
        } else {
            // Mode simulation pour les tests avec l'ancien système de carte
            console.log('🧪 Mode simulation de paiement (ancien système ou développement)');
            await new Promise(resolve => setTimeout(resolve, 1500));
        }
        
        // 💾 Sauvegarder dans Supabase
        console.log('💾 Sauvegarde dans Supabase...');
        await saveOrder(orderData);
        
        console.log('✅ Paiement accepté et commande sauvegardée !');
        
        // ... TON CODE EMAIL EXISTANT (garde-le tel quel) ...
        if (transporter) {
            // Construction de la liste des produits pour l'email
            let productsHtml = '';
            
            if (orderData.products && orderData.products.length > 0) {
                productsHtml = orderData.products.map((product, index) => {
                    return `
                        <div style="margin-bottom: 1rem; padding: 1rem; background: #f8f9fa; border-radius: 8px;">
                            <p><strong>Produit ${index + 1} :</strong> ${product.name}</p>
                            <p><strong>Prix unitaire :</strong> ${product.price}€</p>
                            <p><strong>Quantité :</strong> ${product.quantity}</p>
                            <p><strong>Sous-total :</strong> ${(product.price * product.quantity).toFixed(2)}€</p>
                        </div>
                    `;
                }).join('');
            }
            
            // Section paiement pour l'email
            let paymentHtml = '';
            if (orderData.payment) {
                let paymentMethod = 'Inconnu';
                if (orderData.payment.method === 'stripe') {
                    paymentMethod = 'Stripe (Carte bancaire)';
                } else if (orderData.payment.method === 'card') {
                    paymentMethod = 'Carte bancaire';
                } else if (orderData.payment.method === 'paypal') {
                    paymentMethod = 'PayPal';
                }
                
                paymentHtml = `
                    <hr>
                    <h3>💳 Informations de paiement :</h3>
                    <div style="background: #e8f5e8; padding: 1rem; border-radius: 8px;">
                        <p><strong>Mode de paiement :</strong> ${paymentMethod}</p>
                        ${orderData.payment.cardLast4 ? `
                            <p><strong>Type de carte :</strong> ${orderData.payment.cardBrand || 'Non détecté'}</p>
                            <p><strong>Numéro de carte :</strong> **** **** **** ${orderData.payment.cardLast4}</p>
                        ` : ''}
                        ${orderData.payment.stripePaymentIntentId ? `
                            <p><strong>ID Transaction Stripe :</strong> ${orderData.payment.stripePaymentIntentId}</p>
                        ` : ''}
                        <p style="color: #28a745; font-weight: bold; font-size: 1.1rem;">✅ PAIEMENT CONFIRMÉ</p>
                    </div>
                `;
            }
            
            const adminEmail = {
                from: 'lv9Dreams@gmail.com',
                to: 'lv9Dreams@gmail.com',
                subject: `[LV9Dreams] 💰 COMMANDE PAYÉE ${orderId}`,
                html: `
                    <h2>🎉 Nouvelle commande PAYÉE reçue !</h2>
                    <p><strong>N° commande :</strong> ${orderId}</p>
                    <div style="background: #d4edda; border: 1px solid #c3e6cb; padding: 1rem; border-radius: 8px; margin: 1rem 0;">
                        <h3 style="color: #155724; margin: 0;">💰 STATUT : PAIEMENT CONFIRMÉ ✅</h3>
                        <p style="margin: 0.5rem 0 0; color: #155724;">💾 Automatiquement sauvegardée en base de données</p>
                    </div>
                    
                    <hr>
                    <h3>👤 Client :</h3>
                    <p><strong>Nom :</strong> ${orderData.customer.firstName} ${orderData.customer.lastName}</p>
                    <p><strong>Email :</strong> ${orderData.customer.email}</p>
                    <p><strong>Téléphone :</strong> ${orderData.customer.phone}</p>
                    <p><strong>Adresse :</strong> ${orderData.customer.address}, ${orderData.customer.postalCode} ${orderData.customer.city}, ${orderData.customer.country}</p>
                    ${orderData.customer.notes ? `<p><strong>Notes :</strong> ${orderData.customer.notes}</p>` : ''}
                    
                    ${paymentHtml}
                    
                    <hr>
                    <h3>📦 Produits commandés :</h3>
                    ${productsHtml}
                    
                    <hr>
                    <div style="background: #e8f5e8; padding: 1rem; border-radius: 8px; margin-top: 1rem;">
                        <h3>💰 Récapitulatif financier :</h3>
                        <p><strong>Nombre total d'articles :</strong> ${totalQuantity}</p>
                        <p><strong>Sous-total :</strong> ${orderData.subtotal || orderData.total}€</p>
                        <p><strong>Livraison :</strong> ${orderData.shipping || 0}€ ${orderData.shipping === 0 ? '(Gratuite)' : ''}</p>
                        <p style="font-size: 1.3rem; color: #28a745;"><strong>💰 TOTAL ENCAISSÉ :</strong> ${orderData.total}€</p>
                    </div>
                    
                    <hr>
                    <p><em>Commande passée le ${new Date().toLocaleString('fr-FR')}</em></p>
                    
                    <div style="margin-top: 2rem; padding: 1rem; background: #d1ecf1; border: 1px solid #bee5eb; border-radius: 8px;">
                        <h4>📊 Dashboard Admin :</h4>
                        <p>Cette commande est maintenant visible dans votre <a href="${req.protocol}://${req.get('host')}/admin" style="color: #0c5460; font-weight: bold;">tableau de bord admin</a></p>
                        <p>Consultez vos statistiques en temps réel !</p>
                    </div>
                `
            };
            
            try {
                await transporter.sendMail(adminEmail);
                console.log('📧 Email de notification envoyé');
            } catch (emailError) {
                console.error('❌ Erreur envoi email:', emailError);
            }
        }
        
        // Réponse de succès
        res.json({ 
            success: true, 
            orderId: orderId,
            message: 'Commande et paiement traités avec succès !',
            customerEmail: orderData.customer.email,
            totalProducts: orderData.products ? orderData.products.length : 1,
            totalQuantity: totalQuantity,
            payment: {
                status: 'confirmed',
                method: orderData.payment?.method || 'unknown',
                amount: orderData.total,
                transactionId: orderData.payment?.stripePaymentIntentId || `TXN-${orderId}`
            }
        });
        
        console.log('✅ Commande complète traitée avec succès:', orderId);
        console.log('💰 Montant encaissé:', orderData.total + '€');
        
    } catch (error) {
        console.error('❌ ERREUR COMMANDE:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur lors du traitement de la commande',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});


app.post('/api/contact', async (req, res) => {
    try {
        const { subject, firstName, lastName, email, phone, orderNumber, message } = req.body;
        
        // Configuration de l'email
        const mailOptions = {
            from: 'lv9Dreams@gmail.com',
            to: 'lv9Dreams@gmail.com',
            subject: `[LV9Dreams Contact] ${subject}`,
            html: `
                <h2>Nouveau message depuis le site LV9Dreams</h2>
                <p><strong>Sujet :</strong> ${subject}</p>
                <p><strong>Nom :</strong> ${firstName} ${lastName}</p>
                <p><strong>Email :</strong> ${email}</p>
                <p><strong>Téléphone :</strong> ${phone || 'Non renseigné'}</p>
                <p><strong>N° commande :</strong> ${orderNumber || 'Non renseigné'}</p>
                <hr>
                <h3>Message :</h3>
                <p>${message.replace(/\n/g, '<br>')}</p>
                <hr>
                <p><em>Envoyé depuis lv9dreams.com le ${new Date().toLocaleString('fr-FR')}</em></p>
            `
        };

        // Envoyer l'email
        await transporter.sendMail(mailOptions);
        
        console.log('Email envoyé avec succès vers lv9Dreams@gmail.com');
        res.json({ success: true, message: 'Email envoyé avec succès' });
        
    } catch (error) {
        console.error('Erreur envoi email:', error);
        res.status(500).json({ success: false, message: 'Erreur lors de l\'envoi' });
    }
});





// Socket.IO
io.on('connection', (socket) => {
    console.log("connexion acceptée :", socket.id);
    console.log("-------------------");
    
    // Ajouter l'utilisateur à la liste
    connectedUsers.set(socket.id, {
        id: socket.id,
        connectedAt: new Date(),
        sessionId: socket.handshake.sessionID
    });
    
    // Notifier tous les clients du nombre d'utilisateurs
    io.emit('userCount', connectedUsers.size);
    
    // Exemple d'événement personnalisé
    socket.on('message', (data) => {
        console.log('Message reçu:', data);
        // Diffuser le message à tous les clients
        io.emit('message', {
            from: socket.id,
            data: data,
            timestamp: new Date()
        });
    });
    
    socket.on('disconnect', () => {
        console.log("déconnexion acceptée :", socket.id);
        console.log("-------------------");
        
        // Retirer l'utilisateur de la liste
        connectedUsers.delete(socket.id);
        
        // Notifier tous les clients du nouveau nombre d'utilisateurs
        io.emit('userCount', connectedUsers.size);
    });
});

















// Démarrage du serveur
const PORT = process.env.PORT || 7000;
server.listen(PORT, function(err) {
    if (err) throw err;
    console.log("-------------------");
    console.log("server on port", PORT)
    console.log("-------------------");
});