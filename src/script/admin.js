
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
            loading: false
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

        // === ACTIONS ===
        refreshData: function() {
            console.log('🔄 Actualisation des données admin...');
            this.loading = true;
            
            // Recharger stats et commandes
            this.loadStats();
            this.loadRecentOrders();
            
            setTimeout(() => {
                this.loading = false;
                console.log('✅ Données actualisées');
            }, 1000);
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
            // TODO: Implémenter export CSV
            alert('🚧 Export CSV en cours de développement...');
        },

        downloadBackup: function() {
            // TODO: Backup des données
            alert('🚧 Backup en cours de développement...');
        },

        viewCustomers: function() {
            // TODO: Liste des clients
            alert('🚧 Liste clients en cours de développement...');
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