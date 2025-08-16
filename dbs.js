
require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

// Configuration Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

console.log('🔗 Connexion à Supabase:', supabaseUrl ? '✅' : '❌');

// Sauvegarder une commande
async function saveOrder(orderData) {
    try {
        console.log(`💾 [Supabase] Sauvegarde commande: ${orderData.orderId}`);
        
        // 1. Insérer la commande principale
        const { data: orderResult, error: orderError } = await supabase
            .from('orders')
            .insert([{
                order_id: orderData.orderId,
                customer_first_name: orderData.customer.firstName,
                customer_last_name: orderData.customer.lastName,
                customer_email: orderData.customer.email,
                customer_phone: orderData.customer.phone || null,
                customer_address: orderData.customer.address || null,
                customer_postal_code: orderData.customer.postalCode || null,
                customer_city: orderData.customer.city || null,
                customer_country: orderData.customer.country || null,
                customer_notes: orderData.customer.notes || null,
                total_amount: parseFloat(orderData.total),
                subtotal_amount: parseFloat(orderData.subtotal || orderData.total),
                shipping_amount: parseFloat(orderData.shipping || 0),
                payment_method: orderData.payment?.method || 'unknown',
                payment_card_last4: orderData.payment?.cardLast4 || null,
                payment_card_brand: orderData.payment?.cardBrand || null
            }])
            .select();

        if (orderError) {
            console.error('❌ [Supabase] Erreur insertion commande:', orderError);
            throw orderError;
        }

        // 2. Insérer les produits
        const orderItems = orderData.products.map(product => ({
            order_id: orderData.orderId,
            product_type: product.type,
            product_name: product.name,
            quantity: parseInt(product.quantity),
            unit_price: parseFloat(product.price),
            old_price: product.oldPrice ? parseFloat(product.oldPrice) : null,
            total_price: parseFloat(product.price * product.quantity),
            product_category: product.productType || (product.type === 'ebook' ? 'digital' : 'physical')
        }));

        if (orderItems.length > 0) {
            const { data: itemsResult, error: itemsError } = await supabase
                .from('order_items')
                .insert(orderItems);

            if (itemsError) {
                console.error('❌ [Supabase] Erreur insertion items:', itemsError);
                throw itemsError;
            }
        }

        console.log(`✅ [Supabase] Commande ${orderData.orderId} sauvegardée (${orderData.products.length} produits)`);
        return orderResult[0].id;

    } catch (error) {
        console.error('❌ [Supabase] Erreur sauvegarde:', error.message);
        throw error;
    }
}

// Récupérer les statistiques
async function getStats() {
    try {
        console.log('📊 [Supabase] Récupération des stats...');
        
        const today = new Date().toISOString().split('T')[0];
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        
        // CA aujourd'hui
        const { data: todayOrders } = await supabase
            .from('orders')
            .select('total_amount')
            .gte('created_at', today + 'T00:00:00')
            .lte('created_at', today + 'T23:59:59');

        // CA hier
        const { data: yesterdayOrders } = await supabase
            .from('orders')
            .select('total_amount')
            .gte('created_at', yesterday + 'T00:00:00')
            .lte('created_at', yesterday + 'T23:59:59');

        // Compter commandes aujourd'hui
        const { count: todayOrdersCount } = await supabase
            .from('orders')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', today + 'T00:00:00')
            .lte('created_at', today + 'T23:59:59');

        // Total commandes
        const { count: totalOrdersCount } = await supabase
            .from('orders')
            .select('*', { count: 'exact', head: true });

        // Produit le plus vendu
        const { data: topProductData } = await supabase
            .from('order_items')
            .select('product_name, product_type, quantity')
            .order('quantity', { ascending: false })
            .limit(1);

        // Panier moyen
        const { data: allOrders } = await supabase
            .from('orders')
            .select('total_amount');

        // Calculer les valeurs
        const todayRevenue = todayOrders?.reduce((sum, order) => sum + parseFloat(order.total_amount || 0), 0) || 0;
        const yesterdayRevenue = yesterdayOrders?.reduce((sum, order) => sum + parseFloat(order.total_amount || 0), 0) || 0;
        
        const revenueChange = yesterdayRevenue > 0 
            ? ((todayRevenue - yesterdayRevenue) / yesterdayRevenue * 100)
            : (todayRevenue > 0 ? 100 : 0);

        const averageCart = allOrders?.length > 0 
            ? allOrders.reduce((sum, order) => sum + parseFloat(order.total_amount || 0), 0) / allOrders.length 
            : 0;

        // Ventes des 7 derniers jours (données simulées pour l'instant)
        const salesData = Array.from({ length: 7 }, (_, i) => ({
            date: new Date(Date.now() - (6 - i) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            revenue: Math.random() * 200 + 50
        }));

        // Répartition par type de produit
        const { data: productsData } = await supabase
            .from('order_items')
            .select('product_type, quantity, total_price');

        const productsStats = productsData?.reduce((acc, item) => {
            const type = item.product_type;
            if (!acc[type]) {
                acc[type] = { total_quantity: 0, total_revenue: 0 };
            }
            acc[type].total_quantity += item.quantity;
            acc[type].total_revenue += parseFloat(item.total_price || 0);
            return acc;
        }, {}) || {};

        const result = {
            todayRevenue: todayRevenue,
            revenueChange: revenueChange,
            todayOrders: todayOrdersCount || 0,
            totalOrders: totalOrdersCount || 0,
            topProduct: {
                name: topProductData?.[0]?.product_name || 'Aucune vente',
                count: topProductData?.[0]?.quantity || 0,
                type: topProductData?.[0]?.product_type || ''
            },
            averageCart: averageCart,
            conversionRate: Math.min((totalOrdersCount || 0) / 100 * 3.2, 10),
            salesData: salesData,
            productsData: Object.values(productsStats)
        };

        console.log('✅ [Supabase] Stats calculées:', {
            todayRevenue: result.todayRevenue,
            todayOrders: result.todayOrders,
            totalOrders: result.totalOrders
        });

        return result;

    } catch (error) {
        console.error('❌ [Supabase] Erreur stats:', error.message);
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

// Récupérer les commandes récentes
async function getRecentOrders(limit = 10, offset = 0) {
    try {
        console.log(`📋 [Supabase] Récupération des commandes (limit: ${limit}, offset: ${offset})`);
        
        // Récupérer les commandes avec pagination
        const { data: orders, error: ordersError } = await supabase
            .from('orders')
            .select('*')
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (ordersError) throw ordersError;

        // Compter le total
        const { count: totalCount } = await supabase
            .from('orders')
            .select('*', { count: 'exact', head: true });

        // Récupérer les items pour chaque commande
        const ordersWithItems = await Promise.all(
            (orders || []).map(async (order) => {
                const { data: items } = await supabase
                    .from('order_items')
                    .select('*')
                    .eq('order_id', order.order_id);

                return {
                    id: order.order_id,
                    customer: {
                        name: `${order.customer_first_name} ${order.customer_last_name}`,
                        email: order.customer_email,
                        phone: order.customer_phone,
                        address: `${order.customer_address || ''} ${order.customer_city || ''} ${order.customer_country || ''}`.trim()
                    },
                    products: (items || []).map(item => ({
                        name: item.product_name,
                        type: item.product_type,
                        quantity: item.quantity,
                        price: parseFloat(item.unit_price),
                        total: parseFloat(item.total_price),
                        category: item.product_category
                    })),
                    total: parseFloat(order.total_amount),
                    status: order.status,
                    date: new Date(order.created_at).getTime(),
                    paymentMethod: order.payment_method,
                    paymentInfo: {
                        cardLast4: order.payment_card_last4,
                        cardBrand: order.payment_card_brand
                    }
                };
            })
        );

        console.log(`✅ [Supabase] ${ordersWithItems.length} commandes récupérées`);

        return {
            orders: ordersWithItems,
            pagination: {
                total: totalCount || 0,
                limit: limit,
                offset: offset,
                hasMore: (offset + limit) < (totalCount || 0)
            }
        };

    } catch (error) {
        console.error('❌ [Supabase] Erreur commandes:', error.message);
        return {
            orders: [],
            pagination: { total: 0, limit: limit, offset: offset, hasMore: false }
        };
    }
}

// Supprimer toutes les commandes (admin)
async function clearAllOrders() {
    try {
        console.log('🗑️ [Supabase] Suppression de toutes les commandes...');
        
        // Supprimer d'abord les items (clés étrangères)
        const { error: itemsError } = await supabase
            .from('order_items')
            .delete()
            .neq('id', 0); // Supprimer tout (condition toujours vraie)

        if (itemsError) throw itemsError;

        // Puis supprimer les commandes
        const { error: ordersError } = await supabase
            .from('orders')
            .delete()
            .neq('id', 0); // Supprimer tout

        if (ordersError) throw ordersError;

        console.log('✅ [Supabase] Toutes les commandes supprimées');
        return { success: true };

    } catch (error) {
        console.error('❌ [Supabase] Erreur suppression:', error.message);
        throw error;
    }
}


// Enregistrer une nouvelle visite
async function recordVisit(sessionId, ipAddress, userAgent) {
    try {
        console.log('👥 [Supabase] Enregistrement visite:', { sessionId, ipAddress });
        
        const today = new Date().toISOString().split('T')[0];
        
        // 1. Vérifier si cette session existe déjà
        const { data: existingSession } = await supabase
            .from('visitor_sessions')
            .select('*')
            .eq('session_id', sessionId)
            .single();

        let isNewVisitor = false;
        
        if (existingSession) {
            // Session existante, mettre à jour
            await supabase
                .from('visitor_sessions')
                .update({
                    last_visit: new Date().toISOString(),
                    visit_count: existingSession.visit_count + 1
                })
                .eq('session_id', sessionId);
        } else {
            // Nouvelle session
            await supabase
                .from('visitor_sessions')
                .insert([{
                    session_id: sessionId,
                    ip_address: ipAddress,
                    user_agent: userAgent
                }]);
            isNewVisitor = true;
        }

        // 2. Mettre à jour les stats du jour
        const { data: todayStats } = await supabase
            .from('visitors')
            .select('*')
            .eq('visit_date', today)
            .single();

        if (todayStats) {
            // Jour existant, incrémenter
            await supabase
                .from('visitors')
                .update({
                    total_visits: todayStats.total_visits + 1,
                    unique_visitors: isNewVisitor ? todayStats.unique_visitors + 1 : todayStats.unique_visitors,
                    updated_at: new Date().toISOString()
                })
                .eq('visit_date', today);
        } else {
            // Premier visiteur du jour
            await supabase
                .from('visitors')
                .insert([{
                    visit_date: today,
                    total_visits: 1,
                    unique_visitors: 1
                }]);
        }

        console.log('✅ [Supabase] Visite enregistrée');
        return { success: true, isNewVisitor };

    } catch (error) {
        console.error('❌ [Supabase] Erreur enregistrement visite:', error.message);
        return { success: false, error: error.message };
    }
}

// Récupérer les statistiques de visiteurs
async function getVisitorStats() {
    try {
        console.log('👥 [Supabase] Récupération stats visiteurs...');
        
        const today = new Date().toISOString().split('T')[0];
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        
        // Stats d'aujourd'hui
        const { data: todayStats } = await supabase
            .from('visitors')
            .select('*')
            .eq('visit_date', today)
            .single();

        // Stats d'hier
        const { data: yesterdayStats } = await supabase
            .from('visitors')
            .select('*')
            .eq('visit_date', yesterday)
            .single();

        // Total historique
        const { data: totalStats } = await supabase
            .from('visitors')
            .select('total_visits, unique_visitors');

        const totalVisits = totalStats?.reduce((sum, day) => sum + day.total_visits, 0) || 0;
        const totalUniqueVisitors = totalStats?.reduce((sum, day) => sum + day.unique_visitors, 0) || 0;

        // Visiteurs en ligne (approximation basée sur les 5 dernières minutes)
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const { count: onlineVisitors } = await supabase
            .from('visitor_sessions')
            .select('*', { count: 'exact', head: true })
            .gte('last_visit', fiveMinutesAgo);

        // Stats des 7 derniers jours
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const { data: weeklyStats } = await supabase
            .from('visitors')
            .select('visit_date, total_visits, unique_visitors')
            .gte('visit_date', sevenDaysAgo)
            .order('visit_date', { ascending: true });

        const result = {
            todayVisits: todayStats?.total_visits || 0,
            todayUniqueVisitors: todayStats?.unique_visitors || 0,
            yesterdayVisits: yesterdayStats?.total_visits || 0,
            totalVisits,
            totalUniqueVisitors,
            onlineVisitors: onlineVisitors || 0,
            weeklyStats: weeklyStats || [],
            visitorsChange: yesterdayStats?.total_visits 
                ? (((todayStats?.total_visits || 0) - yesterdayStats.total_visits) / yesterdayStats.total_visits * 100)
                : 100
        };

        console.log('✅ [Supabase] Stats visiteurs:', {
            todayVisits: result.todayVisits,
            onlineVisitors: result.onlineVisitors,
            totalVisits: result.totalVisits
        });

        return result;

    } catch (error) {
        console.error('❌ [Supabase] Erreur stats visiteurs:', error.message);
        return {
            todayVisits: 0,
            todayUniqueVisitors: 0,
            yesterdayVisits: 0,
            totalVisits: 0,
            totalUniqueVisitors: 0,
            onlineVisitors: 0,
            weeklyStats: [],
            visitorsChange: 0
        };
    }
}

// Nettoyer les anciennes sessions (optionnel - pour maintenance)
async function cleanOldSessions(daysOld = 30) {
    try {
        const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString();
        
        const { error } = await supabase
            .from('visitor_sessions')
            .delete()
            .lt('last_visit', cutoffDate);

        if (error) throw error;
        
        console.log('✅ [Supabase] Sessions anciennes nettoyées');
        return { success: true };
        
    } catch (error) {
        console.error('❌ [Supabase] Erreur nettoyage sessions:', error.message);
        return { success: false, error: error.message };
    }
}


async function deleteOrder(orderId) {
    try {
        console.log(`🗑️ [Supabase] Suppression commande: ${orderId}`);
        
        // 1. Supprimer d'abord les items de la commande (clés étrangères)
        const { error: itemsError } = await supabase
            .from('order_items')
            .delete()
            .eq('order_id', orderId);

        if (itemsError) {
            console.error('❌ [Supabase] Erreur suppression items:', itemsError);
            throw itemsError;
        }

        // 2. Puis supprimer la commande principale
        const { error: orderError, data } = await supabase
            .from('orders')
            .delete()
            .eq('order_id', orderId)
            .select();

        if (orderError) {
            console.error('❌ [Supabase] Erreur suppression commande:', orderError);
            throw orderError;
        }

        if (!data || data.length === 0) {
            throw new Error('Commande non trouvée');
        }

        console.log(`✅ [Supabase] Commande ${orderId} supprimée avec succès`);
        return { success: true, deletedOrder: data[0] };

    } catch (error) {
        console.error('❌ [Supabase] Erreur suppression commande:', error.message);
        throw error;
    }
}

module.exports = {
    saveOrder,
    getStats,
    getRecentOrders,
    clearAllOrders,
    recordVisit,
    deleteOrder,
    getVisitorStats,
    cleanOldSessions,
    supabase 
};