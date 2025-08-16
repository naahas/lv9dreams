
let ADMIN_KEY = null;

const MAX_ATTEMPTS = 3;
let loginAttempts = parseInt(localStorage.getItem('admin_attempts') || '0');

// Vue.js Instance
var adminApp = new Vue({
    el: '#app',
    
    data: function() {
        return {
            currentTheme: 'dark',
            stats: {
                todayRevenue: 0,
                revenueChange: 0,
                todayOrders: 0,
                totalOrders: 0,
                topProduct: { name: '-', count: 0 },
                averageCart: 0,
                conversionRate: 0
            },
            recentOrders: [],
            currentPage: 1,
            totalPages: 1,
            salesChart: null,
            productsChart: null,
            loading: false,


            // 🆕 Stats visiteurs pour l'admin
            visitorStats: {
                todayVisits: 0,
                todayUniqueVisitors: 0,
                onlineVisitors: 0,
                totalVisits: 0,
                totalUniqueVisitors: 0,
                visitorsChange: 0,
                weeklyStats: []
            }
        }
    },

    methods: {
        // === AUTHENTIFICATION ===
        checkAuth: function() {
            const isAuthed = sessionStorage.getItem('lv9_admin_access');
            const loginTime = sessionStorage.getItem('lv9_admin_login_time');
            const TWO_HOURS = 2 * 60 * 60 * 1000;
            
            // Vérifier si session expirée
            if (isAuthed && loginTime && (Date.now() - parseInt(loginTime)) > TWO_HOURS) {
                this.logout();
                return;
            }
            
            if (!isAuthed) {
                this.showPasswordPrompt();
            } else {
                this.showDashboard();
            }
        },


        loadVisitorStats: function() {
    fetch('/api/admin/visitor-stats', {
        method: 'GET',
        headers: {
            'x-admin-key': sessionStorage.getItem('lv9_admin_key'),
            'Content-Type': 'application/json'
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            this.visitorStats = data.data;
            console.log('👥 Stats visiteurs admin chargées:', this.visitorStats);
        } else {
            console.error('❌ Erreur chargement stats visiteurs:', data.message);
        }
    })
    .catch(error => {
        console.error('❌ Erreur requête stats visiteurs:', error);
    });
},

        showPasswordPrompt: function() {
    // Vérifier blocage temporaire
    const blockedUntil = localStorage.getItem('admin_blocked_until');
    if (blockedUntil && Date.now() < parseInt(blockedUntil)) {
        alert('🚫 Accès bloqué temporairement. Réessayez plus tard.');
        window.location.href = './';
        return;
    }

    if (loginAttempts >= MAX_ATTEMPTS) {
        const blockTime = Date.now() + (60 * 60 * 1000); // 1h
        localStorage.setItem('admin_blocked_until', blockTime);
        alert('🚫 Trop de tentatives. Accès bloqué pendant 1h.');
        window.location.href = './';
        return;
    }

    const password = prompt('🔐 Accès Administrateur\nMot de passe requis :');
    
    // ✅ NOUVELLE VERSION SIMPLE ET CORRECTE
    if (password !== null) {
        this.verifyPasswordWithServer(password);
    } else {
        // Annulé
        window.location.href = './';
    }
},

        showDashboard: function() {
            document.getElementById('admin-loading').style.display = 'none';
            document.getElementById('admin-dashboard').style.display = 'block';
            this.loadDashboardData();
        },

        logout: function() {
            if (confirm('🚪 Voulez-vous vraiment vous déconnecter ?')) {
                sessionStorage.removeItem('lv9_admin_access');
                sessionStorage.removeItem('lv9_admin_login_time');
                window.location.href = './';
            }
        },

        // === DONNÉES DASHBOARD ===
        loadDashboardData: function() {
    this.loading = true;
    
    // Simuler chargement
    setTimeout(() => {
        this.loadStats();
        this.loadRecentOrders();
        this.loadVisitorStats(); // 🆕 Ajouter cette ligne
        this.initCharts();
        this.loading = false;
    }, 500);
},


        verifyPasswordWithServer: async function(password) {
    try {
        const response = await fetch('/api/admin/verify-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ password: password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Connexion réussie
            loginAttempts = 0;
            localStorage.setItem('admin_attempts', '0');
            sessionStorage.setItem('lv9_admin_access', 'true');
            sessionStorage.setItem('lv9_admin_login_time', Date.now().toString());
            sessionStorage.setItem('lv9_admin_key', password);
            ADMIN_KEY = password;
            this.showDashboard();
        } else {
            // Mauvais mot de passe
            loginAttempts++;
            localStorage.setItem('admin_attempts', loginAttempts.toString());
            const remaining = MAX_ATTEMPTS - loginAttempts;
            
            if (remaining > 0) {
                alert(`❌ Mot de passe incorrect\n${remaining} tentative(s) restante(s)`);
                this.showPasswordPrompt();
            } else {
                const blockTime = Date.now() + (60 * 60 * 1000);
                localStorage.setItem('admin_blocked_until', blockTime);
                alert('🚫 Accès bloqué pendant 1h');
                window.location.href = './';
            }
        }
    } catch (error) {
        console.error('❌ Erreur vérification:', error);
        alert('❌ Erreur de connexion');
    }
},

        loadStats: function() {
            // 🆕 NOUVEAU : Récupérer les vraies stats depuis l'API
            fetch('/api/admin/stats', {
                method: 'GET',
                headers: {
                    'x-admin-key': sessionStorage.getItem('lv9_admin_key'),
                    'Content-Type': 'application/json'
                }
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    this.stats = {
                        todayRevenue: parseFloat(data.data.todayRevenue),
                        revenueChange: parseFloat(data.data.revenueChange),
                        todayOrders: data.data.todayOrders,
                        totalOrders: data.data.totalOrders,
                        topProduct: data.data.topProduct,
                        averageCart: parseFloat(data.data.averageCart),
                        conversionRate: parseFloat(data.data.conversionRate)
                    };
                    
                    console.log('📊 Stats réelles chargées:', this.stats);
                    
                    // Mettre à jour les graphiques avec les vraies données
                    this.$nextTick(() => {
                        if (this.salesChart) {
                            this.salesChart.data.datasets[0].data = data.data.salesData;
                            this.salesChart.update();
                        }
                        
                        if (this.productsChart && data.data.productsData.length > 0) {
                            this.productsChart.data.datasets[0].data = data.data.productsData;
                            this.productsChart.update();
                        }
                    });
                } else {
                    console.error('❌ Erreur chargement stats:', data.message);
                    // Garder les stats par défaut en cas d'erreur
                }
            })
            .catch(error => {
                console.error('❌ Erreur requête stats:', error);
                // En cas d'erreur, utiliser des données par défaut
                this.stats = {
                    todayRevenue: 0,
                    revenueChange: 0,
                    todayOrders: 0,
                    totalOrders: 0,
                    topProduct: { name: 'Aucune vente', count: 0 },
                    averageCart: 0,
                    conversionRate: 0
                };
            });
        },

        loadRecentOrders: function() {
            // 🆕 NOUVEAU : Récupérer les vraies commandes depuis l'API
            fetch('/api/admin/orders?page=1&limit=10', {
                method: 'GET',
                headers: {
                    'x-admin-key': sessionStorage.getItem('lv9_admin_key'),
                    'Content-Type': 'application/json'
                }
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    this.recentOrders = data.data.map(order => ({
                        id: order.id,
                        customer: order.customer,
                        products: order.products,
                        total: order.total,
                        status: order.status,
                        date: order.date,
                        paymentMethod: order.paymentMethod
                    }));
                    
                    // Mettre à jour la pagination
                    this.totalPages = data.pagination.totalPages || 1;
                    this.currentPage = data.pagination.currentPage || 1;
                    
                    console.log(`📋 ${this.recentOrders.length} vraies commandes chargées`);
                    
                    // Afficher un message si aucune commande
                    if (this.recentOrders.length === 0) {
                        console.log('ℹ️ Aucune commande trouvée - passez votre première commande pour voir les données !');
                    }
                } else {
                    console.error('❌ Erreur chargement commandes:', data.message);
                    this.recentOrders = [];
                }
            })
            .catch(error => {
                console.error('❌ Erreur requête commandes:', error);
                this.recentOrders = [];
                
                // Message d'aide pour l'utilisateur
                console.log('ℹ️ Impossible de charger les commandes - vérifiez que le serveur fonctionne');
            });
        },

        // === GRAPHIQUES ===
        initCharts: function() {
            this.$nextTick(() => {
                this.createSalesChart();
                this.createProductsChart();
            });
        },

        createSalesChart: function() {
            const ctx = document.getElementById('salesChart');
            if (!ctx) return;

            this.salesChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'],
                    datasets: [{
                        label: 'Ventes (€)',
                        data: [180, 220, 150, 320, 280, 410, 247],
                        borderColor: '#d4af37',
                        backgroundColor: 'rgba(212, 175, 55, 0.1)',
                        borderWidth: 3,
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            grid: { color: 'rgba(212, 175, 55, 0.1)' },
                            ticks: { color: '#cccccc' }
                        },
                        x: {
                            grid: { color: 'rgba(212, 175, 55, 0.1)' },
                            ticks: { color: '#cccccc' }
                        }
                    }
                }
            });
        },

        createProductsChart: function() {
            const ctx = document.getElementById('productsChart');
            if (!ctx) return;

            this.productsChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['Résine', 'Gélules', 'eBook'],
                    datasets: [{
                        data: [45, 35, 20],
                        backgroundColor: ['#e34b30', '#ffd700', '#ac20f7'],
                        borderColor: '#1a1a2e',
                        borderWidth: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { color: '#cccccc' }
                        }
                    }
                }
            });
        },

        // === UTILITAIRES ===
        formatDate: function(timestamp) {
            const date = new Date(timestamp);
            const now = new Date();
            const diff = now - date;
            
            if (diff < 60 * 60 * 1000) {
                return `Il y a ${Math.floor(diff / (60 * 1000))}min`;
            } else if (diff < 24 * 60 * 60 * 1000) {
                return `Il y a ${Math.floor(diff / (60 * 60 * 1000))}h`;
            } else {
                return date.toLocaleDateString('fr-FR');
            }
        },

        getStatusText: function(status) {
            const statusMap = {
                'paid': 'Payée',
                'processing': 'En cours',
                'shipped': 'Expédiée',
                'delivered': 'Livrée'
            };
            return statusMap[status] || status;
        },

        refreshPage: function () {
            location.reload();
        },

        // === ACTIONS ===
        refreshData: function() {
    console.log('🔄 Actualisation des données admin...');
    this.loading = true;
    
    // Recharger stats et commandes
    this.loadStats();
    this.loadRecentOrders();
    this.loadVisitorStats(); // 🆕 Ajouter cette ligne
    
    setTimeout(() => {
        this.loading = false;
        console.log('✅ Données actualisées');
    }, 1000);
},

showCustomersModal: function() {
    // Supprimer modal existant s'il y en a un
    const existingModal = document.getElementById('customers-modal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Créer le HTML de la modal
    const modalHTML = `
        <div id="customers-modal" class="admin-modal-overlay">
            <div class="admin-modal">
                <div class="modal-header">
                    <h2>👥 Liste des Clients</h2>
                    <button class="modal-close" onclick="document.getElementById('customers-modal').remove()">×</button>
                </div>
                
                <div class="modal-content">
                    <div class="customers-filters">
                        <input type="text" id="customers-search" placeholder="🔍 Rechercher par nom, email..." />
                        <button onclick="adminApp.searchCustomers()">Rechercher</button>
                        <button onclick="adminApp.exportCustomers()">📥 Exporter CSV</button>
                    </div>
                    
                    <div id="customers-loading" style="text-align: center; padding: 2rem;">
                        <div class="loading-spinner"></div>
                        <p>Chargement des clients...</p>
                    </div>
                    
                    <div id="customers-list" style="display: none;">
                        <div class="customers-stats">
                            <div class="stat-item">
                                <span class="stat-label">Total clients :</span>
                                <span id="total-clients">-</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Clients uniques :</span>
                                <span id="unique-clients">-</span>
                            </div>
                        </div>
                        
                        <div class="customers-table">
                            <div class="table-header">
                                <div>Client</div>
                                <div>Contact</div>
                                <div>Localisation</div>
                                <div>Commandes</div>
                                <div>Total dépensé</div>
                                <div>Dernière commande</div>
                            </div>
                            <div id="customers-rows">
                                <!-- Les clients seront ajoutés ici -->
                            </div>
                        </div>
                        
                        <div class="customers-pagination">
                            <button id="prev-customers" onclick="adminApp.loadCustomersPage(adminApp.currentCustomersPage - 1)">← Précédent</button>
                            <span id="customers-page-info">Page 1</span>
                            <button id="next-customers" onclick="adminApp.loadCustomersPage(adminApp.currentCustomersPage + 1)">Suivant →</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Ajouter au DOM
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Initialiser les données
    this.currentCustomersPage = 1;
    this.loadCustomers();
},

loadCustomers: function(page = 1, search = '') {
    const loading = document.getElementById('customers-loading');
    const list = document.getElementById('customers-list');
    
    if (loading) loading.style.display = 'block';
    if (list) list.style.display = 'none';
    
    fetch(`/api/admin/customers?page=${page}&limit=20&search=${encodeURIComponent(search)}`, {
        headers: {
            'x-admin-key': sessionStorage.getItem('lv9_admin_key')
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            this.displayCustomers(data.data, data.pagination);
            this.currentCustomersPage = page;
        } else {
            alert('❌ Erreur: ' + data.message);
        }
    })
    .catch(error => {
        console.error('❌ Erreur chargement clients:', error);
        alert('❌ Erreur de connexion');
    })
    .finally(() => {
        if (loading) loading.style.display = 'none';
        if (list) list.style.display = 'block';
    });
},

displayCustomers: function(customers, pagination) {
    const container = document.getElementById('customers-rows');
    const totalClients = document.getElementById('total-clients');
    const uniqueClients = document.getElementById('unique-clients');
    const pageInfo = document.getElementById('customers-page-info');
    const prevBtn = document.getElementById('prev-customers');
    const nextBtn = document.getElementById('next-customers');
    
    if (!container) return;
    
    // Mettre à jour les stats
    if (totalClients) totalClients.textContent = pagination.totalClients;
    if (uniqueClients) uniqueClients.textContent = pagination.uniqueClients;
    if (pageInfo) pageInfo.textContent = `Page ${pagination.currentPage} / ${pagination.totalPages}`;
    
    // Gérer pagination
    if (prevBtn) prevBtn.disabled = pagination.currentPage === 1;
    if (nextBtn) nextBtn.disabled = !pagination.hasMore;
    
    // Afficher les clients
    container.innerHTML = customers.map(client => `
        <div class="customer-row">
            <div class="customer-info">
                <div class="customer-name">${client.firstName} ${client.lastName}</div>
                <div class="customer-email">${client.email}</div>
            </div>
            <div class="customer-contact">
                <div>${client.phone || 'N/A'}</div>
            </div>
            <div class="customer-location">
                <div>${client.city || 'N/A'}</div>
                <div>${client.country || 'N/A'}</div>
            </div>
            <div class="customer-orders">
                <div class="orders-count">${client.orderCount} commande${client.orderCount > 1 ? 's' : ''}</div>
            </div>
            <div class="customer-total">
                <div class="total-spent">${client.totalSpent.toFixed(2)}€</div>
            </div>
            <div class="customer-last-order">
                <div>${new Date(client.lastOrderDate).toLocaleDateString('fr-FR')}</div>
            </div>
        </div>
    `).join('');
},

searchCustomers: function() {
    const searchInput = document.getElementById('customers-search');
    const searchTerm = searchInput ? searchInput.value.trim() : '';
    this.loadCustomers(1, searchTerm);
},

loadCustomersPage: function(page) {
    if (page < 1) return;
    const searchInput = document.getElementById('customers-search');
    const searchTerm = searchInput ? searchInput.value.trim() : '';
    this.loadCustomers(page, searchTerm);
},

exportCustomers: function() {
    console.log('📥 Export clients...');
    
    const link = document.createElement('a');
    link.href = '/api/admin/backup-csv?' + new URLSearchParams({
        'x-admin-key': sessionStorage.getItem('lv9_admin_key')
    });
    link.download = `lv9dreams_clients_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
},

// === FONCTION BACKUP DONNÉES ===
downloadBackup: function() {
    if (!confirm('💾 Générer un backup complet des données ?\n\nCela peut prendre quelques secondes...')) {
        return;
    }
    
    console.log('💾 Génération backup...');
    
    // Afficher indicateur de chargement
    const originalText = event.target.textContent;
    event.target.textContent = '⏳ Génération...';
    event.target.disabled = true;
    
    fetch('/api/admin/backup', {
        headers: {
            'x-admin-key': sessionStorage.getItem('lv9_admin_key')
        }
    })
    .then(response => {
        if (!response.ok) throw new Error('Erreur serveur');
        return response.json();
    })
    .then(data => {
        // Créer le fichier et le télécharger
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
        const filename = `lv9dreams_backup_${timestamp}.json`;
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { 
            type: 'application/json' 
        });
        
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        
        URL.revokeObjectURL(url);
        
        // Afficher résumé
        const stats = data.metadata.stats;
        alert(`✅ Backup généré avec succès !\n\n` +
              `📦 ${stats.totalOrders} commandes\n` +
              `👥 ${stats.totalClients} clients\n` +
              `💰 ${stats.totalRevenue.toFixed(2)}€ de revenus\n\n` +
              `📁 Fichier: ${filename}`);
        
        console.log('✅ Backup téléchargé:', filename);
    })
    .catch(error => {
        console.error('❌ Erreur backup:', error);
        alert('❌ Erreur lors de la génération du backup');
    })
    .finally(() => {
        // Restaurer le bouton
        event.target.textContent = originalText;
        event.target.disabled = false;
    });
},


cleanOldSessions: function() {
    const daysOld = prompt('Supprimer les sessions de plus de combien de jours ? (défaut: 30)', '30');
    
    if (daysOld === null) return;
    
    const days = parseInt(daysOld) || 30;
    
    if (confirm(`Supprimer les sessions de plus de ${days} jours ?`)) {
        fetch(`/api/admin/clean-old-sessions?days=${days}`, {
            method: 'DELETE',
            headers: {
                'x-admin-key': sessionStorage.getItem('lv9_admin_key'),
                'Content-Type': 'application/json'
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                alert(`✅ ${data.message}`);
                this.loadVisitorStats(); // Recharger les stats
            } else {
                alert('❌ Erreur: ' + data.message);
            }
        })
        .catch(error => {
            console.error('❌ Erreur:', error);
            alert('❌ Erreur de connexion');
        });
    }
},

        loadOrdersPage: function(page) {
            this.currentPage = page;
            
            fetch(`/api/admin/orders?page=${page}&limit=10`, {
                method: 'GET',
                headers: {
                    'x-admin-key': sessionStorage.getItem('lv9_admin_key'),
                    'Content-Type': 'application/json'
                }
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    this.recentOrders = data.data.map(order => ({
                        id: order.id,
                        customer: order.customer,
                        products: order.products,
                        total: order.total,
                        status: order.status,
                        date: order.date,
                        paymentMethod: order.paymentMethod
                    }));
                    this.totalPages = data.pagination.totalPages || 1;
                    console.log(`📋 Page ${page} chargée (${data.data.length} commandes)`);
                }
            })
            .catch(error => {
                console.error('❌ Erreur chargement page:', error);
            });
        },

        exportOrders: function() {
    console.log('📥 Export commandes CSV...');
    
    // Créer le lien de téléchargement
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `lv9dreams_commandes_${timestamp}.csv`;
    
    // Utiliser la route backup-csv qui exporte toutes les commandes
    const link = document.createElement('a');
    link.href = `/api/admin/backup-csv`;
    link.download = filename;
    link.style.display = 'none';
    
    // Ajouter les headers d'authentification
    fetch(`/api/admin/backup-csv`, {
        headers: {
            'x-admin-key': sessionStorage.getItem('lv9_admin_key')
        }
    })
    .then(response => {
        if (!response.ok) throw new Error('Erreur serveur');
        return response.blob();
    })
    .then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        
        console.log('✅ Export commandes téléchargé:', filename);
    })
    .catch(error => {
        console.error('❌ Erreur export commandes:', error);
        alert('❌ Erreur lors de l\'export des commandes');
    });
},

deleteIndividualOrder: function(orderId) {
    // Confirmation de suppression
    const confirmation = confirm(
        `🗑️ Supprimer la commande ${orderId} ?\n\n` +
        'Cette action est définitive et ne peut pas être annulée.\n\n' +
        'Confirmez-vous la suppression ?'
    );
    
    if (!confirmation) return;
    
    console.log(`🗑️ Suppression de la commande: ${orderId}`);
    
    // Désactiver le bouton pendant la suppression
    const deleteBtn = event.target;
    const originalContent = deleteBtn.innerHTML;
    deleteBtn.innerHTML = '⏳';
    deleteBtn.disabled = true;
    
    fetch(`/api/admin/orders/${orderId}`, {
        method: 'DELETE',
        headers: {
            'x-admin-key': sessionStorage.getItem('lv9_admin_key'),
            'Content-Type': 'application/json'
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Succès - Retirer la commande de la liste
            this.recentOrders = this.recentOrders.filter(order => order.id !== orderId);
            
            // Afficher confirmation
            alert(`✅ Commande ${orderId} supprimée avec succès !`);
            
            // Recharger les statistiques pour qu'elles soient à jour
            this.loadStats();
            
            console.log(`✅ Commande ${orderId} supprimée et retirée de la liste`);
            
            // Si plus de commandes sur cette page, recharger
            if (this.recentOrders.length === 0 && this.currentPage > 1) {
                this.loadOrdersPage(this.currentPage - 1);
            }
        } else {
            alert('❌ Erreur: ' + data.message);
            console.error('❌ Erreur suppression:', data.message);
        }
    })
    .catch(error => {
        console.error('❌ Erreur suppression commande:', error);
        alert('❌ Erreur de connexion lors de la suppression');
    })
    .finally(() => {
        // Restaurer le bouton
        deleteBtn.innerHTML = originalContent;
        deleteBtn.disabled = false;
    });
},


        viewCustomers: function() {
            this.showCustomersModal();
        },

        goToSite: function() {
            window.open('./', '_blank');
        },

        toggleTheme: function() {
            this.currentTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
            document.body.classList.toggle('light-mode');
            
            const themeIcon = document.querySelector('.theme-icon');
            if (this.currentTheme === 'light') {
                themeIcon.textContent = '☀️';
                localStorage.setItem('theme', 'light');
            } else {
                themeIcon.textContent = '🌙';
                localStorage.setItem('theme', 'dark');
            }
        },

        changePeriod: function(period) {
            // TODO: Changer la période du graphique
            document.querySelectorAll('.period-btn').forEach(btn => btn.classList.remove('active'));
            event.target.classList.add('active');
        },

        previousPage: function() {
            if (this.currentPage > 1) {
                this.loadOrdersPage(this.currentPage - 1);
            }
        },

        nextPage: function() {
            if (this.currentPage < this.totalPages) {
                this.loadOrdersPage(this.currentPage + 1);
            }
        },

        clearAllOrders: function() {
            const confirmation = confirm(
                '🚨 ATTENTION ! 🚨\n\n' +
                'Vous allez SUPPRIMER DÉFINITIVEMENT toutes les commandes !\n' +
                'Cette action est IRRÉVERSIBLE.\n\n' +
                'Êtes-vous absolument sûr(e) ?'
            );
            
            if (!confirmation) return;
            
            // Double confirmation pour éviter les erreurs
            const finalConfirm = confirm(
                '⚠️ DERNIÈRE CHANCE ⚠️\n\n' +
                'Toutes les commandes vont être perdues à jamais.\n' +
                'Confirmez-vous la suppression ?'
            );
            
            if (!finalConfirm) return;
            
            console.log('🗑️ Suppression de toutes les commandes...');
            
            fetch('/api/admin/clear-orders', {
                method: 'DELETE',
                headers: {
                    'x-admin-key': sessionStorage.getItem('lv9_admin_key'), 
                    'Content-Type': 'application/json'
                }
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    alert(`✅ ${data.deletedOrders} commandes supprimées avec succès !`);
                    console.log('✅ Commandes supprimées:', data);
                    
                    // Recharger les données
                    this.loadStats();
                    this.loadRecentOrders();
                } else {
                    alert('❌ Erreur: ' + data.message);
                }
            })
            .catch(error => {
                console.error('❌ Erreur suppression:', error);
                alert('❌ Erreur de connexion lors de la suppression');
            });
        },
        
        // NOUVEAU : Vider seulement les commandes de test
        clearTestOrders: function() {
            const confirmation = confirm(
                '🧹 Nettoyer les commandes de test ?\n\n' +
                'Cela supprimera les commandes avec des noms/emails de test.\n' +
                'Continuer ?'
            );
            
            if (!confirmation) return;
            
            fetch('/api/admin/clear-test-orders', {
                method: 'DELETE',
                headers: {
                    'x-admin-key': sessionStorage.getItem('lv9_admin_key'),
                    'Content-Type': 'application/json'
                }
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    alert(`✅ ${data.deleted} commandes de test supprimées !`);
                    this.loadStats();
                    this.loadRecentOrders();
                } else {
                    alert('❌ Erreur: ' + data.message);
                }
            })
            .catch(error => {
                console.error('❌ Erreur:', error);
                alert('❌ Erreur de connexion');
            });
        }
    },

    mounted: function() {
        // Charger le thème
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'light') {
            this.currentTheme = 'light';
            document.body.classList.add('light-mode');
            const themeIcon = document.querySelector('.theme-icon');
            if (themeIcon) themeIcon.textContent = '☀️';
        }

        // Initialiser les particules
        if (typeof particlesJS !== 'undefined') {
            particlesJS('particles-js', {
                particles: {
                    number: { value: 50 },
                    color: { value: ['#d4af37', '#ffd700'] },
                    shape: { type: 'circle' },
                    opacity: { value: 0.3 },
                    size: { value: 2 },
                    move: { enable: true, speed: 1 }
                }
            });
        }

        // Vérifier l'authentification
        this.checkAuth();
    }
});

// Protection de la console (optionnel)
document.addEventListener('keydown', function(e) {
    if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I')) {
        e.preventDefault();
        console.clear();
    }
});