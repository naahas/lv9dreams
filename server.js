const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const cors = require('cors');
const nodemailer = require('nodemailer');
const { saveOrder, getStats, getRecentOrders, clearAllOrders , recordVisit, getVisitorStats, cleanOldSessions } = require('./dbs');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const paypal = require('@paypal/checkout-server-sdk');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');



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
app.use(express.static('src/docs'));
app.use(express.static('src/img'));
app.use(sessionMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
io.engine.use(sessionMiddleware);

// Middleware pour URLs propres (sans .html)
app.use((req, res, next) => {
    // Si l'URL se termine par .html, rediriger vers la version sans .html
    if (req.path.endsWith('.html')) {
        const cleanUrl = req.path.slice(0, -5); // Enlever .html
        return res.redirect(301, cleanUrl + req.url.slice(req.path.length));
    }
    next();
});

// Middleware pour servir les fichiers .html sans extension
app.use(async (req, res, next) => {
    // EXCLURE les routes API et autres routes spéciales
    const excludedPaths = ['/api', '/admin', '/download-ebook', '/paypal-success', '/paypal-cancel'];
    
    // Vérifier si l'URL commence par un chemin exclu
    const isExcluded = excludedPaths.some(excluded => req.path.startsWith(excluded));
    
    // Si pas d'extension dans l'URL ET pas une route exclue ET pas la racine
    if (!req.path.includes('.') && req.path !== '/' && !isExcluded) {
        const htmlPath = path.join(__dirname, 'src/html', req.path + '.html');
        
        try {
            // Vérifier si le fichier .html existe (version async)
            await fs.access(htmlPath);
            // Le fichier existe, le servir
            return res.sendFile(htmlPath);
        } catch (err) {
            // Le fichier n'existe pas, continuer vers les autres routes
            next();
        }
    } else {
        next();
    }
});

// Variables globales
let connectedUsers = new Map(); 
const downloadTokens = new Map();


const originalConsoleLog = console.log;
const originalConsoleError = console.error;

console.log = (...args) => {
    originalConsoleLog('[LOG]', new Date().toISOString(), ...args);
};

console.error = (...args) => {
    originalConsoleError('[ERROR]', new Date().toISOString(), ...args);
};

// console.log('🚀 Serveur LV9Dreams démarré');
// console.log('🔧 Environment:', process.env.NODE_ENV);
// console.log('💳 Stripe configuré:', !!process.env.STRIPE_SECRET_KEY);
// console.log('📧 Email configuré:', !!process.env.SMTP_PASS);
// console.log('💾 Supabase configuré:', !!process.env.SUPABASE_URL);

// Routes
app.get('/', function(req, res) {
    res.sendFile(__dirname + '/src/html/home.html');
});

// app.get('/home' , function(req, res) {
//     res.sendFile(__dirname + '/src/html/home.html');
// });


app.get('/admin', function(req, res) {
    res.sendFile(__dirname + '/src/html/admin.html');
});

app.get('/order', function(req, res) {
    res.sendFile(__dirname + '/src/html/order.html');
});

app.get('/contact', function(req, res) {
    res.sendFile(__dirname + '/src/html/contact.html');
});

app.get('/mentions', function(req, res) {
    res.sendFile(__dirname + '/src/html/mentions.html');
});

app.get('/confidentialite', function(req, res) {
    res.sendFile(__dirname + '/src/html/confidentialite.html');
});

app.get('/cgv', function(req, res) {
    res.sendFile(__dirname + '/src/html/cgv.html');
});

app.get('/faq', function(req, res) {
    res.sendFile(__dirname + '/src/html/faq.html');
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


app.post('/api/visit', async (req, res) => {
    try {
        // Générer un ID de session unique s'il n'existe pas
        let sessionId = req.session.visitorId;
        if (!sessionId) {
            sessionId = crypto.randomUUID();
            req.session.visitorId = sessionId;
        }
        
        // Obtenir l'IP du visiteur (en tenant compte des proxies)
        const ipAddress = req.headers['x-forwarded-for'] 
            ? req.headers['x-forwarded-for'].split(',')[0].trim()
            : req.ip || req.connection.remoteAddress;
        
        const userAgent = req.headers['user-agent'] || 'Unknown';
        
        console.log('👥 Nouvelle visite:', { sessionId, ipAddress });
        
        // Enregistrer la visite
        const result = await recordVisit(sessionId, ipAddress, userAgent);
        
        // Diffuser les nouvelles stats à tous les clients connectés
        const visitorStats = await getVisitorStats();
        io.emit('visitorUpdate', {
            onlineVisitors: visitorStats.onlineVisitors,
            todayVisits: visitorStats.todayVisits,
            totalVisits: visitorStats.totalVisits
        });
        
        res.json({
            success: true,
            sessionId,
            isNewVisitor: result.isNewVisitor,
            stats: visitorStats
        });
        
    } catch (error) {
        console.error('❌ Erreur enregistrement visite:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur enregistrement visite'
        });
    }
});

// 🆕 Route pour récupérer les stats visiteurs (publique)
app.get('/api/visitor-stats', async (req, res) => {
    try {
        const stats = await getVisitorStats();
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('❌ Erreur stats visiteurs:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur récupération stats'
        });
    }
});

// 🆕 Route admin pour stats visiteurs détaillées
app.get('/api/admin/visitor-stats', validateAdminKey, async (req, res) => {
    try {
        const stats = await getVisitorStats();
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('❌ Erreur stats visiteurs admin:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur récupération stats admin'
        });
    }
});

// 🆕 Route de maintenance pour nettoyer les anciennes sessions
app.delete('/api/admin/clean-old-sessions', validateAdminKey, async (req, res) => {
    try {
        const daysOld = parseInt(req.query.days) || 30;
        const result = await cleanOldSessions(daysOld);
        
        res.json({
            success: true,
            message: `Sessions de plus de ${daysOld} jours supprimées`
        });
    } catch (error) {
        console.error('❌ Erreur nettoyage sessions:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur nettoyage sessions'
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
    const startTime = Date.now();
    
    try {
        const { amount, currency = 'eur', orderData } = req.body;
        
        console.log('💳 [STRIPE] === DÉBUT CREATE-PAYMENT-INTENT ===');
        console.log('💰 [STRIPE] Montant reçu:', amount, currency);
        console.log('📦 [STRIPE] Customer email:', orderData?.customer?.email);
        console.log('📦 [STRIPE] Products count:', orderData?.products?.length);
        
        // VÉRIFICATIONS DÉTAILLÉES
        console.log('🔍 [STRIPE] Vérifications...');
        
        if (!process.env.STRIPE_SECRET_KEY) {
            console.error('❌ [STRIPE] STRIPE_SECRET_KEY manquante !');
            return res.status(500).json({
                success: false,
                message: 'Configuration Stripe manquante'
            });
        }
        console.log('✅ [STRIPE] Clé secrète trouvée:', process.env.STRIPE_SECRET_KEY.substring(0, 7) + '...');
        
        if (!amount || isNaN(amount) || amount <= 0) {
            console.error('❌ [STRIPE] Montant invalide:', amount);
            return res.status(400).json({
                success: false,
                message: 'Montant invalide'
            });
        }
        console.log('✅ [STRIPE] Montant valide:', amount);
        
        if (!orderData || !orderData.customer || !orderData.products) {
            console.error('❌ [STRIPE] Données commande incomplètes');
            return res.status(400).json({
                success: false,
                message: 'Données de commande manquantes'
            });
        }
        console.log('✅ [STRIPE] Données commande complètes');
        
        // CALCUL MONTANT
        const amountInCents = Math.round(parseFloat(amount) * 100);
        console.log('💰 [STRIPE] Conversion:', amount, '€ =', amountInCents, 'centimes');
        
        // TENTATIVE CRÉATION PAYMENT INTENT AVEC GESTION D'ERREUR DÉTAILLÉE
        console.log('🔄 [STRIPE] Création Payment Intent...');
        
        let paymentIntent;
        try {
            paymentIntent = await stripe.paymentIntents.create({
                amount: amountInCents,
                currency: currency.toLowerCase(),
                payment_method_types: ['card'],
                metadata: {
                    customer_email: orderData?.customer?.email || '',
                    customer_name: `${orderData?.customer?.firstName || ''} ${orderData?.customer?.lastName || ''}`.trim(),
                    products_count: orderData?.products?.length || 0,
                    order_source: 'lv9dreams_website',
                    timestamp: new Date().toISOString()
                },
                description: `Commande LV9Dreams - ${orderData?.products?.length || 0} produit(s) - ${amount}€`
            });
            
            console.log('✅ [STRIPE] Payment Intent créé avec succès !');
            console.log('✅ [STRIPE] ID:', paymentIntent.id);
            console.log('✅ [STRIPE] Statut:', paymentIntent.status);
            
        } catch (stripeError) {
            console.error('❌ [STRIPE] === ERREUR STRIPE DÉTAILLÉE ===');
            console.error('❌ [STRIPE] Type:', stripeError.type);
            console.error('❌ [STRIPE] Code:', stripeError.code);
            console.error('❌ [STRIPE] Message:', stripeError.message);
            console.error('❌ [STRIPE] Decline code:', stripeError.decline_code);
            console.error('❌ [STRIPE] Param:', stripeError.param);
            console.error('❌ [STRIPE] Request ID:', stripeError.request_id);
            
            // LOG COMPLET DE L'ERREUR (sans les propriétés undefined)
            const errorInfo = {
                type: stripeError.type,
                code: stripeError.code,
                message: stripeError.message,
                param: stripeError.param,
                request_id: stripeError.request_id
            };
            console.error('❌ [STRIPE] Erreur complète:', JSON.stringify(errorInfo, null, 2));
            
            // RÉPONSE D'ERREUR CLAIRE
            return res.status(500).json({
                success: false,
                message: 'Erreur Stripe: ' + stripeError.message,
                error_type: stripeError.type,
                error_code: stripeError.code,
                stripe_request_id: stripeError.request_id
            });
        }
        
        // SUCCÈS
        const endTime = Date.now();
        console.log('✅ [STRIPE] Durée totale:', endTime - startTime, 'ms');
        
        res.json({
            success: true,
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id,
            amount: amount,
            currency: currency
        });
        
        console.log('✅ [STRIPE] === FIN CREATE-PAYMENT-INTENT (SUCCÈS) ===');
        
    } catch (error) {
        const endTime = Date.now();
        console.error('❌ [STRIPE] === ERREUR GÉNÉRALE ===');
        console.error('❌ [STRIPE] Message:', error.message);
        console.error('❌ [STRIPE] Stack:', error.stack);
        console.error('❌ [STRIPE] Durée avant erreur:', endTime - startTime, 'ms');
        
        res.status(500).json({
            success: false,
            message: 'Erreur interne serveur',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});


app.get('/api/test-stripe-connection', validateAdminKey, async (req, res) => {
    try {
        console.log('🧪 Test connexion Stripe...');
        
        // Test simple : lister les méthodes de paiement (ne coûte rien)
        const paymentMethods = await stripe.paymentMethods.list({
            customer: 'cus_test', // Customer qui n'existe pas, mais ça teste la connexion
            type: 'card'
        });
        
        res.json({
            success: true,
            message: 'Stripe fonctionne !',
            stripe_api_version: stripe._api.version,
            test_mode: process.env.STRIPE_SECRET_KEY.includes('sk_test')
        });
        
    } catch (error) {
        console.error('❌ Test Stripe échoué:', error.message);
        res.json({
            success: false,
            message: 'Stripe ne fonctionne pas',
            error: error.message,
            stripe_configured: !!process.env.STRIPE_SECRET_KEY
        });
    }
});


// === ROUTE LISTE CLIENTS ===
app.get('/api/admin/customers', validateAdminKey, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const search = req.query.search || '';
        const offset = (page - 1) * limit;
        
        console.log(`👥 Récupération des clients (page ${page}, recherche: "${search}")`);
        
        const { supabase } = require('./dbs');
        
        // Construction de la requête avec recherche optionnelle
        let query = supabase
            .from('orders')
            .select(`
                customer_first_name,
                customer_last_name, 
                customer_email,
                customer_phone,
                customer_city,
                customer_country,
                total_amount,
                created_at
            `)
            .order('created_at', { ascending: false });
        
        // Ajouter filtre de recherche si fourni
        if (search.trim()) {
            query = query.or(
                `customer_first_name.ilike.%${search}%,` +
                `customer_last_name.ilike.%${search}%,` +
                `customer_email.ilike.%${search}%,` +
                `customer_phone.ilike.%${search}%`
            );
        }
        
        // Appliquer pagination
        const { data: orders, error, count } = await query
            .range(offset, offset + limit - 1)
            .limit(limit);
        
        if (error) throw error;
        
        // Grouper par client et calculer stats
        const clientsMap = new Map();
        
        orders?.forEach(order => {
            const email = order.customer_email;
            
            if (clientsMap.has(email)) {
                const client = clientsMap.get(email);
                client.totalSpent += parseFloat(order.total_amount || 0);
                client.orderCount += 1;
                if (new Date(order.created_at) > new Date(client.lastOrderDate)) {
                    client.lastOrderDate = order.created_at;
                }
            } else {
                clientsMap.set(email, {
                    firstName: order.customer_first_name,
                    lastName: order.customer_last_name,
                    email: order.customer_email,
                    phone: order.customer_phone,
                    city: order.customer_city,
                    country: order.customer_country,
                    totalSpent: parseFloat(order.total_amount || 0),
                    orderCount: 1,
                    firstOrderDate: order.created_at,
                    lastOrderDate: order.created_at
                });
            }
        });
        
        // Convertir en array et trier par dépense totale
        const clients = Array.from(clientsMap.values())
            .sort((a, b) => b.totalSpent - a.totalSpent);
        
        // Compter le total unique de clients
        const { count: totalUniqueClients } = await supabase
            .from('orders')
            .select('customer_email', { count: 'exact', head: true })
            .not('customer_email', 'is', null);
        
        console.log(`✅ ${clients.length} clients récupérés`);
        
        res.json({
            success: true,
            data: clients,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil((count || 0) / limit),
                totalClients: count || 0,
                uniqueClients: totalUniqueClients || 0,
                hasMore: (offset + limit) < (count || 0)
            }
        });
        
    } catch (error) {
        console.error('❌ Erreur liste clients:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur récupération clients'
        });
    }
});

// === ROUTE BACKUP COMPLET ===
app.get('/api/admin/backup', validateAdminKey, async (req, res) => {
    try {
        console.log('💾 Génération backup complet...');
        
        const { supabase } = require('./dbs');
        
        // 1. Récupérer toutes les commandes avec leurs items
        const { data: orders, error: ordersError } = await supabase
            .from('orders')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (ordersError) throw ordersError;
        
        const { data: orderItems, error: itemsError } = await supabase
            .from('order_items')
            .select('*')
            .order('order_id', { ascending: false });
        
        if (itemsError) throw itemsError;
        
        // 2. Récupérer les stats visiteurs
        const { data: visitors, error: visitorsError } = await supabase
            .from('visitors')
            .select('*')
            .order('visit_date', { ascending: false });
        
        const { data: visitorSessions, error: sessionsError } = await supabase
            .from('visitor_sessions')
            .select('*')
            .order('first_visit', { ascending: false })
            .limit(1000); // Limiter pour éviter trop de données
        
        // 3. Calculer des statistiques générales
        const stats = {
            totalOrders: orders?.length || 0,
            totalRevenue: orders?.reduce((sum, order) => sum + parseFloat(order.total_amount || 0), 0) || 0,
            totalClients: new Set(orders?.map(o => o.customer_email)).size || 0,
            dateRange: {
                firstOrder: orders?.length > 0 ? orders[orders.length - 1].created_at : null,
                lastOrder: orders?.length > 0 ? orders[0].created_at : null
            },
            backupDate: new Date().toISOString(),
            backupVersion: '1.0'
        };
        
        // 4. Créer l'objet backup complet
        const backupData = {
            metadata: {
                siteName: 'LV9Dreams',
                exportDate: new Date().toISOString(),
                version: '1.0',
                stats: stats
            },
            orders: orders || [],
            orderItems: orderItems || [],
            visitors: visitors || [],
            visitorSessions: visitorSessions || []
        };
        
        console.log(`✅ Backup généré: ${stats.totalOrders} commandes, ${stats.totalClients} clients`);
        
        // 5. Définir le nom de fichier avec timestamp
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
        const filename = `lv9dreams_backup_${timestamp}.json`;
        
        // 6. Envoyer le fichier en téléchargement
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Cache-Control', 'no-cache');
        
        res.json(backupData);
        
    } catch (error) {
        console.error('❌ Erreur backup:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur génération backup'
        });
    }
});

// === ROUTE BACKUP CSV (ALTERNATIVE) ===
app.get('/api/admin/backup-csv', validateAdminKey, async (req, res) => {
    try {
        console.log('📊 Génération backup CSV...');
        
        const { supabase } = require('./dbs');
        
        // Récupérer commandes avec calculs
        const { data: orders, error } = await supabase
            .from('orders')
            .select(`
                order_id,
                customer_first_name,
                customer_last_name,
                customer_email,
                customer_phone,
                customer_address,
                customer_city,
                customer_country,
                total_amount,
                payment_method,
                created_at
            `)
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        // Créer le CSV
        const csvHeaders = [
            'ID_Commande',
            'Date',
            'Prénom', 
            'Nom',
            'Email',
            'Téléphone',
            'Ville',
            'Pays',
            'Montant_Total',
            'Mode_Paiement'
        ].join(',');
        
        const csvRows = orders?.map(order => [
            order.order_id,
            new Date(order.created_at).toLocaleDateString('fr-FR'),
            `"${order.customer_first_name || ''}"`,
            `"${order.customer_last_name || ''}"`,
            order.customer_email,
            order.customer_phone || '',
            `"${order.customer_city || ''}"`,
            `"${order.customer_country || ''}"`,
            order.total_amount,
            order.payment_method || ''
        ].join(',')) || [];
        
        const csvContent = [csvHeaders, ...csvRows].join('\n');
        
        // Nom de fichier avec timestamp
        const timestamp = new Date().toISOString().slice(0, 10);
        const filename = `lv9dreams_orders_${timestamp}.csv`;
        
        console.log(`✅ CSV généré: ${orders?.length || 0} commandes`);
        
        // Envoyer le CSV
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send('\uFEFF' + csvContent); // BOM pour Excel
        
    } catch (error) {
        console.error('❌ Erreur backup CSV:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur génération CSV'
        });
    }
});





app.get('/api/debug/stripe-config', validateAdminKey, (req, res) => {
    res.json({
        success: true,
        debug: {
            stripeSecretKeyExists: !!process.env.STRIPE_SECRET_KEY,
            stripeSecretKeyPrefix: process.env.STRIPE_SECRET_KEY ? process.env.STRIPE_SECRET_KEY.substring(0, 7) + '...' : 'Missing',
            stripePublishableKeyExists: !!process.env.STRIPE_PUBLISHABLE_KEY,
            stripePublishableKeyPrefix: process.env.STRIPE_PUBLISHABLE_KEY ? process.env.STRIPE_PUBLISHABLE_KEY.substring(0, 7) + '...' : 'Missing',
            nodeEnv: process.env.NODE_ENV,
            herokuSlug: process.env.HEROKU_SLUG_DESCRIPTION || 'Not on Heroku'
        }
    });
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



app.get('/download-ebook/:token', async (req, res) => {
    try {
        const { token } = req.params;
        
        // Vérifier si le token existe
        const tokenData = downloadTokens.get(token);
        if (!tokenData) {
            return res.status(404).send(`
                <!DOCTYPE html>
                <html>
                <head><title>Lien non valide</title></head>
                <body style="font-family: Arial; text-align: center; margin-top: 50px;">
                    <h2>❌ Lien de téléchargement non valide ou expiré</h2>
                    <p>Ce lien n'existe pas ou a expiré.</p>
                    <a href="/">Retour à l'accueil</a>
                </body>
                </html>
            `);
        }
        
        // Vérifier si le token a expiré
        if (Date.now() > tokenData.expiresAt) {
            downloadTokens.delete(token);
            return res.status(410).send(`
                <!DOCTYPE html>
                <html>
                <head><title>Lien expiré</title></head>
                <body style="font-family: Arial; text-align: center; margin-top: 50px;">
                    <h2>⏰ Lien de téléchargement expiré</h2>
                    <p>Ce lien a expiré. Contactez-nous pour obtenir un nouveau lien.</p>
                    <a href="/contact.html">Nous contacter</a>
                </body>
                </html>
            `);
        }
        
        // Limiter le nombre de téléchargements (optionnel)
        if (tokenData.downloadCount >= 5) {
            return res.status(429).send(`
                <!DOCTYPE html>
                <html>
                <head><title>Limite atteinte</title></head>
                <body style="font-family: Arial; text-align: center; margin-top: 50px;">
                    <h2>⚠️ Limite de téléchargement atteinte</h2>
                    <p>Vous avez déjà téléchargé ce fichier 5 fois.</p>
                    <a href="/contact.html">Contactez-nous pour assistance</a>
                </body>
                </html>
            `);
        }
        
        const ebookPath = path.join(__dirname, 'src', 'docs', 'ebookfinal.pdf');
        
        // Vérifier si le fichier existe
        try {
            await fs.access(ebookPath);
        } catch (error) {
            console.error('❌ Fichier eBook introuvable:', ebookPath);
            return res.status(404).send(`
                <!DOCTYPE html>
                <html>
                <head><title>Fichier introuvable</title></head>
                <body style="font-family: Arial; text-align: center; margin-top: 50px;">
                    <h2>❌ Fichier temporairement indisponible</h2>
                    <p>Contactez-nous pour assistance.</p>
                    <a href="/contact.html">Nous contacter</a>
                </body>
                </html>
            `);
        }
        
        // Incrémenter le compteur de téléchargements
        tokenData.downloadCount++;
        tokenData.downloaded = true;
        tokenData.lastDownloadAt = new Date().toISOString();
        
        console.log(`📚 Téléchargement eBook - Client: ${tokenData.customerName} (${tokenData.customerEmail})`);
        
        // Envoyer le fichier
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="LV9-Code-Guide-Ultime.pdf"');
        res.setHeader('Cache-Control', 'private, no-cache');
        
        res.sendFile(ebookPath);
        
    } catch (error) {
        console.error('❌ Erreur téléchargement eBook:', error);
        res.status(500).send(`
            <!DOCTYPE html>
            <html>
            <head><title>Erreur</title></head>
            <body style="font-family: Arial; text-align: center; margin-top: 50px;">
                <h2>❌ Erreur serveur</h2>
                <p>Une erreur s'est produite. Veuillez réessayer plus tard.</p>
                <a href="/">Retour à l'accueil</a>
            </body>
            </html>
        `);
    }
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
        
       
        if (transporter) {
            // Vérifier si la commande contient un eBook
            const hasEbook = orderData.products.some(product => 
                product.type === 'ebook' || product.name.toLowerCase().includes('ebook')
            );
            
            let ebookSection = '';
            let downloadToken = '';
            
            if (hasEbook) {
                // Générer un token de téléchargement sécurisé
                downloadToken = generateDownloadToken(orderData);
                //const downloadUrl = `${req.protocol}://${req.get('host')}/download-ebook/${downloadToken}`;
                const downloadUrl = `${req.protocol}://${req.get('host')}/download-ebook/${downloadToken}`;
    
                ebookSection = `
                    <div style="background: #e8f4fd; border: 2px solid #2196F3; padding: 1.5rem; border-radius: 10px; margin: 1.5rem 0;">
                        <h3 style="color: #1565C0; margin: 0 0 1rem 0; display: flex; align-items: center;">
                            📚 Votre eBook est prêt !
                        </h3>
                        <p style="margin: 0 0 1rem 0; color: #1565C0;">
                            <strong>Téléchargez votre guide "LV9 Code - Guide Ultime du Succès" dès maintenant :</strong>
                        </p>
                        <div style="text-align: center; margin: 1.5rem 0;">
                            <a href="${downloadUrl}" 
                            style="background: #2196F3; 
                                    color: white; 
                                    padding: 15px 30px; 
                                    text-decoration: none; 
                                    border-radius: 8px; 
                                    font-weight: bold; 
                                    font-size: 1.1rem;
                                    display: inline-block;">
                                📥 TÉLÉCHARGER L'EBOOK MAINTENANT
                            </a>
                        </div>
                        <div style="font-size: 0.9rem; color: #666; border-top: 1px solid #ddd; padding-top: 1rem; margin-top: 1rem;">
                            <p><strong>⚠️ Important :</strong></p>
                            <ul style="margin: 0; padding-left: 1.5rem;">
                                <li>Ce lien est valide pendant <strong>7 jours</strong></li>
                                <li>Maximum <strong>5 téléchargements</strong> autorisés</li>
                                <li>Gardez ce lien précieusement !</li>
                            </ul>
                            <p style="margin: 0.5rem 0 0;">
                                <em>En cas de problème, contactez-nous à lv9Dreams@gmail.com</em>
                            </p>
                        </div>
                    </div>
                `;
            }
            
            // Construction de la liste des produits pour l'email (garde ton code existant)
            let productsHtml = '';
            if (orderData.products && orderData.products.length > 0) {
                productsHtml = orderData.products.map((product, index) => {
                    const isDigital = product.type === 'ebook' || product.name.toLowerCase().includes('ebook');
                    const digitalBadge = isDigital ? '<div style="background: #4CAF50; color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; display: inline-block; margin-bottom: 0.5rem;">📚 PRODUIT NUMÉRIQUE</div>' : '';
                    
                    return `
                        <div style="margin-bottom: 1rem; padding: 1rem; background: #f8f9fa; border-radius: 8px;">
                            ${digitalBadge}
                            <p><strong>Produit ${index + 1} :</strong> ${product.name}</p>
                            <p><strong>Prix unitaire :</strong> ${product.price}€</p>
                            <p><strong>Quantité :</strong> ${product.quantity}</p>
                            <p><strong>Sous-total :</strong> ${(product.price * product.quantity).toFixed(2)}€</p>
                            ${isDigital ? '<p style="color: #4CAF50; font-weight: bold;">✅ Téléchargement disponible immédiatement ci-dessus</p>' : ''}
                        </div>
                    `;
                }).join('');
            }
            
            // Email au client
            const customerEmail = {
                from: 'lv9Dreams@gmail.com',
                to: orderData.customer.email,
                subject: `✅ Commande confirmée ${orderId} - LV9Dreams`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <div style="background: #2c3e50; padding: 2rem; text-align: center; border-radius: 10px 10px 0 0;">
                            <h1 style="color: #d4af37; margin: 0; font-size: 2rem;">LV9Dreams</h1>
                            <p style="color: white; margin: 0.5rem 0 0;">Commande confirmée !</p>
                        </div>
                        
                        <div style="padding: 2rem; background: white; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                            <h2 style="color: #2c3e50;">Bonjour ${orderData.customer.firstName},</h2>
                            <p>Merci pour votre commande ! Voici les détails :</p>
                            
                            <div style="background: #d4edda; border: 1px solid #c3e6cb; padding: 1rem; border-radius: 8px; margin: 1rem 0;">
                                <p style="margin: 0; color: #155724;"><strong>✅ N° commande :</strong> ${orderId}</p>
                                <p style="margin: 0; color: #155724;"><strong>💰 Montant :</strong> ${orderData.total}€</p>
                                <p style="margin: 0; color: #155724;"><strong>📅 Date :</strong> ${new Date().toLocaleString('fr-FR')}</p>
                            </div>
                            
                            ${ebookSection}
                            
                            <h3>📦 Produits commandés :</h3>
                            ${productsHtml}
                            
                            <div style="border-top: 1px solid #ddd; padding-top: 1rem; margin-top: 1rem;">
                                <p>Questions ? Contactez-nous à <a href="mailto:lv9Dreams@gmail.com">lv9Dreams@gmail.com</a></p>
                                <p style="color: #666; font-size: 0.9rem;">
                                    Merci de votre confiance !<br>
                                    L'équipe LV9Dreams
                                </p>
                            </div>
                        </div>
                    </div>
                `
            };
            
            try {
                await transporter.sendMail(customerEmail);
                console.log('📧 Email de confirmation envoyé au client');
                if (hasEbook) {
                    console.log('📚 Token de téléchargement eBook généré:', downloadToken);
                }
            } catch (emailError) {
                console.error('❌ Erreur envoi email client:', emailError);
            }

            // Email admin (à ajouter après l'email client)
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
                    
                    <h3>👤 Client :</h3>
                    <p><strong>Nom :</strong> ${orderData.customer.firstName} ${orderData.customer.lastName}</p>
                    <p><strong>Email :</strong> ${orderData.customer.email}</p>
                    <p><strong>Téléphone :</strong> ${orderData.customer.phone}</p>
                    <p><strong>Adresse :</strong> ${orderData.customer.address}, ${orderData.customer.postalCode} ${orderData.customer.city}, ${orderData.customer.country}</p>
                    
                    <h3>📦 Produits commandés :</h3>
                    ${productsHtml}
                    
                    <h3>💰 TOTAL ENCAISSÉ : ${orderData.total}€</h3>
                    ${hasEbook ? '<p style="color: #2196F3; font-weight: bold;">📚 Commande contient un eBook - Token généré !</p>' : ''}
                `
            };

            await transporter.sendMail(adminEmail);
            console.log('📧 Email admin envoyé');
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


setInterval(() => {
    const now = Date.now();
    for (const [token, data] of downloadTokens.entries()) {
        if (now > data.expiresAt) {
            downloadTokens.delete(token);
        }
    }
    console.log(`🧹 Nettoyage tokens eBook: ${downloadTokens.size} actifs`);
}, 60 * 60 * 1000); // 1 heure

// Route admin pour voir les téléchargements (optionnel)
app.get('/api/admin/ebook-downloads', validateAdminKey, (req, res) => {
    const downloads = Array.from(downloadTokens.entries()).map(([token, data]) => ({
        token,
        ...data,
        isExpired: Date.now() > data.expiresAt
    }));
    
    res.json({
        success: true,
        activeTokens: downloads.length,
        downloads: downloads
    });
});


app.get('/paypal-confirm', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="fr">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Confirmation PayPal - LV9Dreams</title>
            <style>
                body { 
                    font-family: 'Inter', sans-serif; 
                    background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #16213e 100%);
                    color: #ffffff;
                    display: flex; 
                    justify-content: center; 
                    align-items: center; 
                    min-height: 100vh; 
                    margin: 0;
                    padding: 2rem;
                }
                .container { 
                    text-align: center; 
                    padding: 3rem;
                    background: rgba(255, 255, 255, 0.05);
                    backdrop-filter: blur(15px);
                    border: 1px solid rgba(212, 175, 55, 0.2);
                    border-radius: 20px;
                    max-width: 500px;
                    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
                }
                .logo {
                    font-family: 'Orbitron', monospace;
                    font-size: 2rem;
                    font-weight: 700;
                    background: linear-gradient(45deg, #d4af37, #ffd700);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    margin-bottom: 2rem;
                }
                h1 {
                    color: #d4af37;
                    margin-bottom: 1.5rem;
                    font-size: 1.8rem;
                }
                p {
                    color: #cccccc;
                    line-height: 1.6;
                    margin-bottom: 2rem;
                }
                .buttons {
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                }
                .btn {
                    padding: 1rem 2rem;
                    border: none;
                    border-radius: 12px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    text-decoration: none;
                    display: inline-block;
                    font-size: 1rem;
                }
                .btn-primary {
                    background: linear-gradient(45deg, #28a745, #34ce57);
                    color: white;
                }
                .btn-primary:hover {
                    transform: translateY(-3px);
                    box-shadow: 0 10px 25px rgba(40, 167, 69, 0.4);
                }
                .btn-secondary {
                    background: transparent;
                    color: #d4af37;
                    border: 2px solid #d4af37;
                }
                .btn-secondary:hover {
                    background: #d4af37;
                    color: #000000;
                    transform: translateY(-3px);
                }
                .notice {
                    background: rgba(255, 193, 7, 0.1);
                    border: 1px solid rgba(255, 193, 7, 0.3);
                    padding: 1rem;
                    border-radius: 10px;
                    margin-bottom: 2rem;
                    color: #ffc107;
                    font-size: 0.9rem;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="logo">LV9Dreams</div>
                <h1>🅿️ Avez-vous finalisé votre paiement PayPal ?</h1>
                <p>
                    Si vous avez effectué le paiement sur PayPal, cliquez sur "Oui, j'ai payé" 
                    pour confirmer votre commande.
                </p>
                <div class="notice">
                    💡 Votre commande ne sera confirmée qu'après validation de votre paiement
                </div>
                <div class="buttons">
                    <button class="btn btn-primary" onclick="confirmPayment()">
                        ✅ Oui, j'ai payé
                    </button>
                    <a href="/" class="btn btn-secondary">
                        ❌ Non, retour à l'accueil
                    </a>
                </div>
            </div>
            
            <script>
                async function confirmPayment() {
                    try {
                        // Récupérer les données de commande temporaires
                        const orderData = JSON.parse(sessionStorage.getItem('lv9_paypal_pending_order'));
                        
                        if (!orderData) {
                            alert('❌ Erreur: Données de commande introuvables');
                            window.location.href = '/';
                            return;
                        }
                        
                        // Afficher loading
                        document.querySelector('.btn-primary').innerHTML = '⏳ Confirmation en cours...';
                        document.querySelector('.btn-primary').disabled = true;
                        
                        // Envoyer la commande au serveur MAINTENANT
                        const finalOrderData = {
                            customer: orderData.customer,
                            products: orderData.products,
                            subtotal: orderData.total,
                            shipping: 0,
                            total: orderData.total,
                            payment: {
                                method: 'paypal_me',
                                amount: orderData.total,
                                currency: 'EUR',
                                status: 'pending_verification',
                                paypal_me_url: \`https://paypal.me/naahas/\${orderData.total}EUR\`,
                                timestamp: new Date().toISOString()
                            },
                            orderDate: new Date().toISOString()
                        };
                        
                        const response = await fetch('/api/order', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(finalOrderData)
                        });
                        
                        const result = await response.json();
                        
                        if (result.success) {
                            // Nettoyer les données temporaires
                            sessionStorage.removeItem('lv9_paypal_pending_order');
                            localStorage.removeItem('lv9dreams_cart');
                            localStorage.removeItem('lv9dreams_cart_count');
                            
                            // Afficher succès
                            document.querySelector('.container').innerHTML = \`
                                <div class="logo">LV9Dreams</div>
                                <h1>✅ Commande confirmée !</h1>
                                <p>Merci ! Votre commande \${result.orderId} a été enregistrée.</p>
                                <p>Vous allez recevoir un email de confirmation.</p>
                                <a href="/" class="btn btn-primary">Retour à l'accueil</a>
                            \`;
                            
                            // Redirection automatique après 5 secondes
                            setTimeout(() => {
                                window.location.href = '/';
                            }, 5000);
                            
                        } else {
                            throw new Error(result.message || 'Erreur serveur');
                        }
                        
                    } catch (error) {
                        console.error('Erreur confirmation:', error);
                        alert('❌ Erreur: ' + error.message);
                        document.querySelector('.btn-primary').innerHTML = '✅ Oui, j\\'ai payé';
                        document.querySelector('.btn-primary').disabled = false;
                    }
                }
                
                // Nettoyer si l'utilisateur quitte sans confirmer
                window.addEventListener('beforeunload', () => {
                    // On ne nettoie PAS ici pour permettre plusieurs tentatives
                });
            </script>
        </body>
        </html>
    `);
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

    getVisitorStats().then(stats => {
        io.emit('visitorUpdate', {
            onlineVisitors: stats.onlineVisitors,
            todayVisits: stats.todayVisits,
            totalVisits: stats.totalVisits,
            connectedUsers: connectedUsers.size
        });
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

        getVisitorStats().then(stats => {
            io.emit('visitorUpdate', {
                onlineVisitors: stats.onlineVisitors,
                todayVisits: stats.todayVisits,
                totalVisits: stats.totalVisits,
                connectedUsers: connectedUsers.size
            });
        });
        
        // Notifier tous les clients du nouveau nombre d'utilisateurs
        io.emit('userCount', connectedUsers.size);
    });
});


// 🆕 Tâche de nettoyage automatique (lance une fois par jour)
setInterval(async () => {
    try {
        await cleanOldSessions(30); // Nettoie les sessions de plus de 30 jours
        console.log('🧹 Nettoyage automatique des sessions effectué');
    } catch (error) {
        console.error('❌ Erreur nettoyage automatique:', error);
    }
}, 24 * 60 * 60 * 1000); // Une fois par jour



function generateDownloadToken(orderData) {
    const token = crypto.randomBytes(32).toString('hex');
    const expirationTime = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 jours
    
    downloadTokens.set(token, {
        orderId: orderData.orderId,
        customerEmail: orderData.customer.email,
        customerName: `${orderData.customer.firstName} ${orderData.customer.lastName}`,
        expiresAt: expirationTime,
        downloaded: false,
        downloadCount: 0
    });
    
    return token;
}






































// Démarrage du serveur
const PORT = process.env.PORT || 7000;
server.listen(PORT, function(err) {
    if (err) throw err;
    console.log("-------------------");
    console.log("server on port", PORT)
    console.log("-------------------");
});