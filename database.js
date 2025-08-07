
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');


// Créer le dossier data s'il n'existe pas
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Initialisation de la base de données
const dbPath = path.join(dataDir, 'orders.db');
const db = new Database(dbPath);

// Configuration pour de meilleures performances
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

// Créer les tables si elles n'existent pas
function initDatabase() {
    
    // Table orders
    db.exec(`
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id TEXT UNIQUE NOT NULL,
            customer_first_name TEXT NOT NULL,
            customer_last_name TEXT NOT NULL,
            customer_email TEXT NOT NULL,
            customer_phone TEXT,
            customer_address TEXT,
            customer_postal_code TEXT,
            customer_city TEXT,
            customer_country TEXT,
            customer_notes TEXT,
            total_amount REAL NOT NULL,
            subtotal_amount REAL,
            shipping_amount REAL DEFAULT 0,
            status TEXT DEFAULT 'paid',
            payment_method TEXT,
            payment_card_last4 TEXT,
            payment_card_brand TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Table order_items
    db.exec(`
        CREATE TABLE IF NOT EXISTS order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id TEXT NOT NULL,
            product_type TEXT NOT NULL,
            product_name TEXT NOT NULL,
            quantity INTEGER NOT NULL,
            unit_price REAL NOT NULL,
            old_price REAL,
            total_price REAL NOT NULL,
            product_category TEXT DEFAULT 'physical',
            FOREIGN KEY (order_id) REFERENCES orders (order_id)
        )
    `);

    // Index pour optimiser les requêtes
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at);
        CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
        CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items (order_id);
        CREATE INDEX IF NOT EXISTS idx_order_items_product_type ON order_items (product_type);
    `);

    
}

// Sauvegarder une commande complète
function saveOrder(orderData) {
    const transaction = db.transaction(() => {
        try {
            // Insérer la commande principale
            const insertOrder = db.prepare(`
                INSERT INTO orders (
                    order_id, customer_first_name, customer_last_name, customer_email, 
                    customer_phone, customer_address, customer_postal_code, customer_city, 
                    customer_country, customer_notes, total_amount, subtotal_amount, 
                    shipping_amount, payment_method, payment_card_last4, payment_card_brand
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            const orderResult = insertOrder.run(
                orderData.orderId,
                orderData.customer.firstName,
                orderData.customer.lastName,
                orderData.customer.email,
                orderData.customer.phone || null,
                orderData.customer.address || null,
                orderData.customer.postalCode || null,
                orderData.customer.city || null,
                orderData.customer.country || null,
                orderData.customer.notes || null,
                parseFloat(orderData.total),
                parseFloat(orderData.subtotal || orderData.total),
                parseFloat(orderData.shipping || 0),
                orderData.payment?.method || 'unknown',
                orderData.payment?.cardLast4 || null,
                orderData.payment?.cardBrand || null
            );

            // Insérer les produits
            const insertItem = db.prepare(`
                INSERT INTO order_items (
                    order_id, product_type, product_name, quantity, 
                    unit_price, old_price, total_price, product_category
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);

            orderData.products.forEach(product => {
                insertItem.run(
                    orderData.orderId,
                    product.type,
                    product.name,
                    parseInt(product.quantity),
                    parseFloat(product.price),
                    product.oldPrice ? parseFloat(product.oldPrice) : null,
                    parseFloat(product.price * product.quantity),
                    product.productType || (product.type === 'ebook' ? 'digital' : 'physical')
                );
            });

            console.log(`💾 Commande ${orderData.orderId} sauvegardée en DB (${orderData.products.length} produits)`);
            return orderResult.lastInsertRowid;

        } catch (error) {
            console.error('❌ Erreur sauvegarde commande:', error);
            throw error;
        }
    });

    return transaction();
}

// Récupérer les statistiques pour le dashboard
function getStats() {
    try {
        const today = new Date().toISOString().split('T')[0];
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        
        // CA aujourd'hui
        const todayRevenue = db.prepare(`
            SELECT COALESCE(SUM(total_amount), 0) as revenue 
            FROM orders 
            WHERE DATE(created_at) = ?
        `).get(today);

        // CA hier (pour calculer l'évolution)
        const yesterdayRevenue = db.prepare(`
            SELECT COALESCE(SUM(total_amount), 0) as revenue 
            FROM orders 
            WHERE DATE(created_at) = ?
        `).get(yesterday);

        // Commandes aujourd'hui
        const todayOrders = db.prepare(`
            SELECT COUNT(*) as count 
            FROM orders 
            WHERE DATE(created_at) = ?
        `).get(today);

        // Total commandes
        const totalOrders = db.prepare(`
            SELECT COUNT(*) as count FROM orders
        `).get();

        // Produit le plus vendu (toutes périodes)
        const topProduct = db.prepare(`
            SELECT product_name, product_type, SUM(quantity) as total_sold
            FROM order_items 
            GROUP BY product_name, product_type
            ORDER BY total_sold DESC 
            LIMIT 1
        `).get();

        // Panier moyen
        const avgCart = db.prepare(`
            SELECT AVG(total_amount) as avg FROM orders
        `).get();

        // Ventes des 7 derniers jours pour le graphique
        const salesData = db.prepare(`
            SELECT 
                DATE(created_at) as date, 
                COALESCE(SUM(total_amount), 0) as revenue,
                COUNT(*) as orders_count
            FROM orders 
            WHERE created_at >= datetime('now', '-7 days')
            GROUP BY DATE(created_at)
            ORDER BY date ASC
        `).all();

        // Répartition par type de produit
        const productsData = db.prepare(`
            SELECT 
                product_type,
                SUM(quantity) as total_quantity,
                SUM(total_price) as total_revenue
            FROM order_items
            GROUP BY product_type
            ORDER BY total_revenue DESC
        `).all();

        // Calculer l'évolution du CA
        const revenueChange = yesterdayRevenue.revenue > 0 
            ? ((todayRevenue.revenue - yesterdayRevenue.revenue) / yesterdayRevenue.revenue * 100)
            : (todayRevenue.revenue > 0 ? 100 : 0);

        // Estimation du taux de conversion (très basique)
        const conversionRate = totalOrders.count > 0 ? Math.min((totalOrders.count / 100) * 3.2, 10) : 0;

        return {
            todayRevenue: todayRevenue.revenue,
            revenueChange: revenueChange,
            todayOrders: todayOrders.count,
            totalOrders: totalOrders.count,
            topProduct: {
                name: topProduct?.product_name || 'Aucune vente',
                count: topProduct?.total_sold || 0,
                type: topProduct?.product_type || ''
            },
            averageCart: avgCart.avg || 0,
            conversionRate: conversionRate,
            salesData: salesData,
            productsData: productsData
        };

    } catch (error) {
        console.error('❌ Erreur récupération stats:', error);
        return {
            todayRevenue: 0,
            revenueChange: 0,
            todayOrders: 0,
            totalOrders: 0,
            topProduct: { name: 'Erreur', count: 0 },
            averageCart: 0,
            conversionRate: 0,
            salesData: [],
            productsData: []
        };
    }
}

function getRecentOrders(limit = 10, offset = 0) {
    try {
        const orders = db.prepare(`
            SELECT *,
            -- Convertir la date en timestamp JavaScript (millisecondes)
            strftime('%s', created_at) * 1000 as timestamp
            FROM orders 
            ORDER BY created_at DESC 
            LIMIT ? OFFSET ?
        `).all(limit, offset);

        const totalCount = db.prepare(`SELECT COUNT(*) as count FROM orders`).get();
        const getOrderItems = db.prepare(`SELECT * FROM order_items WHERE order_id = ? ORDER BY id`);

        const ordersWithItems = orders.map(order => ({
            id: order.order_id,
            customer: {
                name: `${order.customer_first_name} ${order.customer_last_name}`,
                email: order.customer_email,
                phone: order.customer_phone,
                address: `${order.customer_address || ''} ${order.customer_city || ''} ${order.customer_country || ''}`.trim()
            },
            products: getOrderItems.all(order.order_id).map(item => ({
                name: item.product_name,
                type: item.product_type,
                quantity: item.quantity,
                price: item.unit_price,
                total: item.total_price,
                category: item.product_category
            })),
            total: order.total_amount,
            status: order.status,
            // CORRECTION : Utiliser le timestamp converti
            date: order.timestamp, // Timestamp en millisecondes
            paymentMethod: order.payment_method,
            paymentInfo: {
                cardLast4: order.payment_card_last4,
                cardBrand: order.payment_card_brand
            }
        }));

        return {
            orders: ordersWithItems,
            pagination: {
                total: totalCount.count,
                limit: limit,
                offset: offset,
                hasMore: (offset + limit) < totalCount.count
            }
        };

    } catch (error) {
        console.error('❌ Erreur récupération commandes:', error);
        return {
            orders: [],
            pagination: { total: 0, limit: limit, offset: offset, hasMore: false }
        };
    }
}

// Utilitaire pour obtenir des stats rapides
function getQuickStats() {
    try {
        const stats = db.prepare(`
            SELECT 
                COUNT(*) as total_orders,
                COALESCE(SUM(total_amount), 0) as total_revenue,
                COALESCE(AVG(total_amount), 0) as avg_order_value
            FROM orders
        `).get();

        return {
            totalOrders: stats.total_orders,
            totalRevenue: stats.total_revenue,
            averageOrderValue: stats.avg_order_value
        };
    } catch (error) {
        console.error('❌ Erreur stats rapides:', error);
        return { totalOrders: 0, totalRevenue: 0, averageOrderValue: 0 };
    }
}

// Fermeture propre de la DB
function closeDatabase() {
    db.close();
    console.log('🔒 Base de données fermée');
}

// Gestion de la fermeture propre
process.on('SIGINT', () => {
    closeDatabase();
    process.exit(0);
});

module.exports = {
    initDatabase,
    saveOrder,
    getStats,
    getRecentOrders,
    getQuickStats,
    closeDatabase,
    db
};