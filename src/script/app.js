
var app = new Vue({
        el: '#app', // Il faudra wrapper ton site dans une div avec id="app"
        
        data: function() {
            return {
                // Variables pour ton site LV9Dreams
                logoClicked: false,
                currentTheme: 'dark',
                isMenuOpen: false,
                selectedProduct: null,
                activeFaq: null,
                
                products: {
                    resine: {
                        name: 'Shilajit Résine Pur',
                        price: 19.99,
                        oldPrice: 29.99,
                        description: 'Résine pure et authentique récoltée en haute altitude',
                        image: 'shilajit2.png', // ← AJOUTER CETTE LIGNE
                        type: 'physical' 
                    },
                    gelules: {
                        name: 'Shilajit Gélules Pur',
                        price: 16.99,
                        oldPrice: 25.99,
                        description: 'Gélules pratiques et dosées avec précision',
                        image: 'shilajit3.png', // ← AJOUTER CETTE LIGNE
                        type: 'physical' 
                    },
                    ebook: {
                        name: 'LV9 Code - Guide Ultime du Succès',
                        price: 0.70,
                        oldPrice: null,
                        description: 'eBook de développement personnel et stratégies de réussite',
                        image: 'ebookcover.jpg', 
                        type: 'digital'
                    }
                },
                
                testimonials: [],
                contactForm: {
                    subject: '',
                    name: '',
                    firstName: '',
                    lastName: '',
                    email: '',
                    phone: '',
                    orderNumber: '',
                    message: '',
                    newsletter: false,
                    privacy: false
                },
                isSubmitting: false,
                submitSuccess: false,
                submitError: null,

                // CORRECTION : Initialisation du panier
                cartItems: [],
                cartItemsCount: 0,
                cartClicked: false,
                isCartOpen: false,
                cartLoaded: false,

                // 🆕 Données pour le compteur de visiteurs
                visitorStats: {
                    onlineVisitors: 0,
                    todayVisits: 0,
                    todayUniqueVisitors: 0,
                    totalVisits: 0,
                    totalUniqueVisitors: 0,
                    visitorsChange: 0,
                    connectedUsers: 0
                },
                showVisitorPopup: false,
                onlineChanged: false,
                todayChanged: false,
                visitorStatsInterval: null,
                socket: null
            }
        },

        methods: {
            // Méthode pour actualiser la page via le logo
            refreshPage: function() {
                this.logoClicked = true;
                console.log('Logo cliqué !');
                
                setTimeout(() => {
                    window.location.reload();
                }, 100);


            
            },


            addEbookToCart: function(event) {
                // STOPPER absolument tout événement
                if (event) {
                    event.preventDefault();
                    event.stopPropagation();
                    event.stopImmediatePropagation();
                }
                
                console.log('📚 === AJOUT EBOOK SÉCURISÉ ===');
                console.log('📚 Event bloqué:', !!event);
                
                // Vérifier que le produit ebook existe
                if (!this.products || !this.products.ebook) {
                    console.error('❌ ERREUR: eBook non trouvé!');
                    return false;
                }
                
                console.log('📚 Panier avant:', JSON.stringify(this.cartItems.map(i => i.type)));
                
                // FORCER l'ajout SEULEMENT de l'eBook
                const product = this.products.ebook;
                const existingItemIndex = this.cartItems.findIndex(item => item.type === 'ebook');
                
                if (existingItemIndex !== -1) {
                    // eBook existe déjà, augmenter la quantité
                    this.cartItems[existingItemIndex].quantity += 1;
                    console.log('📚 Quantité eBook augmentée');
                } else {
                    // Nouveau eBook
                    const newItem = {
                        type: 'ebook',
                        name: product.name,
                        price: product.price,
                        oldPrice: product.oldPrice,
                        quantity: 1,
                        image: product.image || 'ebookcover.jpg',
                        productType: 'digital'
                    };
                    
                    this.cartItems.push(newItem);
                    console.log('📚 Nouvel eBook ajouté:', newItem);
                }
                
                // Sauvegarder
                this.updateCartCount();
                this.saveCartToStorage();
                
                console.log('📚 Panier après:', JSON.stringify(this.cartItems.map(i => i.type)));
                
                // Animation
                this.animateCartIcon();
                
                console.log('📚 === FIN AJOUT EBOOK ===');
                
                return false;
            },

            // AJOUTER cette méthode pour notification spéciale eBook
            showEbookNotification: function() {
                // Créer notification spéciale pour eBook
                const notification = document.createElement('div');
                notification.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 0.4rem; font-size: 0.85rem;">
                        <span style="font-size: 1rem;">📚</span>
                        <span>eBook ajouté au panier</span>
                    </div>
                `;
                
                notification.style.cssText = `
                    position: fixed;
                    top: 80px;
                    right: 80px;
                    background: rgba(212, 175, 55, 0.95);
                    color: #000;
                    padding: 0.6rem 1rem;
                    border-radius: 8px;
                    font-weight: 500;
                    z-index: 9999;
                    box-shadow: 0 4px 12px rgba(212, 175, 55, 0.3);
                    transform: translateX(100%) scale(0.8);
                    transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
                    opacity: 0;
                    backdrop-filter: blur(10px);
                    border: 1px solid rgba(212, 175, 55, 0.4);
                    font-size: 0.85rem;
                    white-space: nowrap;
                `;
                
                document.body.appendChild(notification);
                
                // Animation d'entrée
                setTimeout(() => {
                    notification.style.transform = 'translateX(0) scale(1)';
                    notification.style.opacity = '1';
                }, 10);
                
                // Animation de sortie
                setTimeout(() => {
                    notification.style.transform = 'translateX(100%) scale(0.8)';
                    notification.style.opacity = '0';
                    
                    setTimeout(() => {
                        if (notification.parentNode) {
                            notification.parentNode.removeChild(notification);
                        }
                    }, 300);
                }, 2000);
            },


             addToCartWithNotification: function(productType) {
                console.log('🎯 Clic sur ajouter au panier pour:', productType);
                
                // Ajouter au panier
                this.addToCart(productType, 1);
                
                // Animation du panier SEULEMENT
                this.animateCartIcon();
                
                // SUPPRIMÉ : this.showDiscreteNotification(productType);
                
                console.log(`✅ ${productType} ajouté au panier !`);
            },

            // NOUVELLE : Animation discrète du panier
            animateCartIcon: function() {
                const cartBtn = document.querySelector('.cart-toggle');
                if (cartBtn) {
                    // Animation bounce très légère
                    cartBtn.style.transform = 'scale(1.15)';
                    cartBtn.style.transition = 'transform 0.2s cubic-bezier(0.68, -0.55, 0.265, 1.55)';
                    
                    setTimeout(() => {
                        cartBtn.style.transform = 'scale(1)';
                        setTimeout(() => {
                            cartBtn.style.transition = ''; // Reset
                        }, 200);
                    }, 200);
                    
                    // Petit effet de brillance
                    cartBtn.classList.add('cart-shine');
                    setTimeout(() => {
                        cartBtn.classList.remove('cart-shine');
                    }, 600);
                }
            },

            enableAdminCounter() {
    // Fonction secrète pour activer le compteur (au cas où)
    sessionStorage.setItem('lv9_admin_counter', 'true');
    this.initVisitorCounter();
},


checkAdminStatusPeriodically() {
    setInterval(() => {
        if (!this.checkIfUserIsAdmin()) {
            // L'utilisateur n'est plus admin, masquer le compteur
            const counter = document.querySelector('.visitor-counter');
            const popup = document.querySelector('.visitor-popup');
            
            if (counter) counter.style.display = 'none';
            if (popup) popup.style.display = 'none';
            
            // Arrêter les mises à jour
            if (this.visitorStatsInterval) {
                clearInterval(this.visitorStatsInterval);
                this.visitorStatsInterval = null;
            }
            
            console.log('🔒 Compteur désactivé - Session admin expirée');
        }
    }, 60000); // Vérifier toutes les minutes
},



            // NOUVELLE : Notification très discrète (mini toast)
            showDiscreteNotification: function(productType) {
                const productNames = {
                    resine: 'Résine',
                    gelules: 'Gélules',
                    ebook: 'eBook',
                    ebook_already: 'eBook déjà dans le panier',
                    empty: 'Panier vide'
                };
                
                const notification = document.createElement('div');
                
                if (productType === 'empty') {
                    notification.innerHTML = `
                        <div style="display: flex; align-items: center; gap: 0.4rem; font-size: 0.85rem;">
                            <span style="font-size: 1rem;">🛒</span>
                            <span>Votre panier est vide</span>
                        </div>
                    `;
                } else if (productType === 'ebook_already') {
                    notification.innerHTML = `
                        <div style="display: flex; align-items: center; gap: 0.4rem; font-size: 0.85rem;">
                            <span style="font-size: 1rem;">📚</span>
                            <span>eBook déjà dans le panier</span>
                        </div>
                    `;
                } else {
                    const icon = productType === 'ebook' ? '📚' : '✓';
                    notification.innerHTML = `
                        <div style="display: flex; align-items: center; gap: 0.4rem; font-size: 0.85rem;">
                            <span style="font-size: 1rem;">${icon}</span>
                            <span>${productNames[productType]} ajouté</span>
                        </div>
                    `;
                }
                
                // Reste du code notification identique...
                notification.style.cssText = `
                    position: fixed;
                    top: 80px;
                    right: 80px;
                    background: rgba(212, 175, 55, 0.95);
                    color: #000;
                    padding: 0.6rem 1rem;
                    border-radius: 8px;
                    font-weight: 500;
                    z-index: 9999;
                    box-shadow: 0 4px 12px rgba(212, 175, 55, 0.3);
                    transform: translateX(100%) scale(0.8);
                    transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
                    opacity: 0;
                    backdrop-filter: blur(10px);
                    border: 1px solid rgba(212, 175, 55, 0.4);
                    font-size: 0.85rem;
                    white-space: nowrap;
                `;
                
                document.body.appendChild(notification);
                
                setTimeout(() => {
                    notification.style.transform = 'translateX(0) scale(1)';
                    notification.style.opacity = '1';
                }, 10);
                
                setTimeout(() => {
                    notification.style.transform = 'translateX(100%) scale(0.8)';
                    notification.style.opacity = '0';
                    
                    setTimeout(() => {
                        if (notification.parentNode) {
                            notification.parentNode.removeChild(notification);
                        }
                    }, 300);
                }, 2000);
            },


            async initVisitorCounter() {
    try {
        console.log('👥 Initialisation compteur visiteurs...');
        
        // Enregistrer cette visite (pour tous les visiteurs - tracking invisible)
        const response = await fetch('/api/visit', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log('✅ Visite enregistrée silencieusement');
        }
        
        // 🔒 VÉRIFIER SI L'UTILISATEUR EST ADMIN
        const isAdmin = this.checkIfUserIsAdmin();
        
        if (isAdmin) {
            console.log('👨‍💼 Utilisateur admin détecté - Activation du compteur');
            
            // Charger les stats pour l'admin
            await this.loadVisitorStats();
            this.startVisitorStatsUpdates();
            this.initSocketIO();
            
            // Rendre le compteur visible
            const counter = document.querySelector('.visitor-counter');
            if (counter) {
                counter.style.display = 'block';
                counter.style.opacity = '1';
            }
        } else {
            console.log('👤 Visiteur normal - Compteur masqué');
            
            // Masquer complètement le compteur
            const counter = document.querySelector('.visitor-counter');
            const popup = document.querySelector('.visitor-popup');
            
            if (counter) counter.style.display = 'none';
            if (popup) popup.style.display = 'none';
        }
        
    } catch (error) {
        console.error('❌ Erreur initialisation visiteurs:', error);
    }
},

    // Charger les statistiques visiteurs
    async loadVisitorStats() {
        try {
            const response = await fetch('/api/visitor-stats');
            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    const oldOnline = this.visitorStats.onlineVisitors;
                    const oldToday = this.visitorStats.todayVisits;
                    
                    this.visitorStats = { ...data.data };
                    
                    // Animations pour les changements
                    if (oldOnline !== this.visitorStats.onlineVisitors) {
                        this.triggerNumberAnimation('online');
                    }
                    if (oldToday !== this.visitorStats.todayVisits) {
                        this.triggerNumberAnimation('today');
                    }
                }
            }
        } catch (error) {
            console.error('❌ Erreur chargement stats visiteurs:', error);
        }
    },

    // Démarrer les mises à jour automatiques
    startVisitorStatsUpdates() {
        // Mise à jour toutes les 30 secondes
        this.visitorStatsInterval = setInterval(() => {
            this.loadVisitorStats();
        }, 30000);
        
        console.log('⏰ Mises à jour automatiques des stats démarrées');
    },

    // Initialiser Socket.IO pour les mises à jour temps réel
    initSocketIO() {
        try {
            // Utiliser la connexion Socket.IO existante ou en créer une nouvelle
            if (typeof io !== 'undefined') {
                this.socket = io();
                
                // Écouter les mises à jour de visiteurs
                this.socket.on('visitorUpdate', (data) => {
                    console.log('📡 Mise à jour visiteurs temps réel:', data);
                    
                    const oldOnline = this.visitorStats.onlineVisitors;
                    const oldToday = this.visitorStats.todayVisits;
                    
                    // Mettre à jour les stats
                    this.visitorStats = {
                        ...this.visitorStats,
                        ...data
                    };
                    
                    // Animations
                    if (oldOnline !== this.visitorStats.onlineVisitors) {
                        this.triggerNumberAnimation('online');
                    }
                    if (oldToday !== this.visitorStats.todayVisits) {
                        this.triggerNumberAnimation('today');
                    }
                });
                
                console.log('🔗 Socket.IO connecté pour les stats visiteurs');
            }
        } catch (error) {
            console.error('❌ Erreur Socket.IO visiteurs:', error);
        }
    },

    // Animation des changements de chiffres
    triggerNumberAnimation(type) {
        if (type === 'online') {
            this.onlineChanged = true;
            setTimeout(() => { this.onlineChanged = false; }, 500);
        } else if (type === 'today') {
            this.todayChanged = true;
            setTimeout(() => { this.todayChanged = false; }, 500);
        }
    },

    // Toggle popup détaillée
    toggleVisitorPopup() {
        this.showVisitorPopup = !this.showVisitorPopup;
        
        if (this.showVisitorPopup) {
            // Rafraîchir les stats quand on ouvre la popup
            this.loadVisitorStats();
        }
    },

    // Fermer la popup
    closeVisitorPopup() {
        this.showVisitorPopup = false;
    },

    // Formater les gros nombres
    formatNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'k';
        }
        return num.toString();
    },


             toggleCart: function() {
                this.cartClicked = true;
                setTimeout(() => {
                    this.cartClicked = false;
                }, 300);
                
                this.isCartOpen = !this.isCartOpen;
                
                // Empêcher le scroll du body quand la sidebar est ouverte
                if (this.isCartOpen) {
                    document.body.style.overflow = 'hidden';
                } else {
                    document.body.style.overflow = '';
                }
            },


            closeCart: function() {
                this.isCartOpen = false;
                document.body.style.overflow = '';
            },

            
            addToCart: function(productType, quantity = 1) {
                console.log('🛒 Ajout au panier:', productType, 'quantité:', quantity);
                
                // DEBUG : Afficher tous les produits disponibles
                console.log('📦 Produits disponibles:', Object.keys(this.products));
                console.log('📦 Produit demandé:', productType);
                
                // Vérifier que le produit existe
                if (!this.products[productType]) {
                    console.error('❌ Produit non trouvé:', productType);
                    console.error('❌ Produits disponibles:', this.products);
                    return;
                }
                
                const product = this.products[productType];
                console.log('📦 Produit trouvé:', product);
                
                // Chercher si le produit existe déjà dans le panier
                const existingItemIndex = this.cartItems.findIndex(item => item.type === productType);
                
                if (existingItemIndex !== -1) {
                    // Le produit existe déjà, augmenter la quantité
                    this.cartItems[existingItemIndex].quantity += quantity;
                    console.log('➕ Quantité augmentée pour', productType);
                } else {
                    // Nouveau produit, l'ajouter au panier
                    const newItem = {
                        type: productType,
                        name: product.name,
                        price: product.price,
                        oldPrice: product.oldPrice,
                        quantity: quantity,
                        image: product.image || 'shilajit2.png', // Image par défaut
                        productType: product.type || 'physical'
                    };
                    
                    this.cartItems.push(newItem);
                    console.log('🆕 Nouveau produit ajouté:', newItem);
                }
                
                // Mettre à jour le compteur et sauvegarder
                this.updateCartCount();
                this.saveCartToStorage();
                
                console.log('📊 État final du panier:', this.cartItems);
                console.log('🔢 Nombre total d\'articles:', this.cartItemsCount);
                
                // Animation du badge
                this.$nextTick(() => {
                    const badge = document.querySelector('.cart-badge');
                    if (badge && this.cartItemsCount > 0) {
                        badge.classList.add('show');
                    }
                });
            },


             increaseItemQuantity: function(productType) {
                const item = this.cartItems.find(item => item.type === productType);
                if (item && item.quantity < 10) {
                    item.quantity++;
                    this.updateCartCount();
                }
            },

            // NOUVELLE fonction pour diminuer quantité d'un item
            decreaseItemQuantity: function(productType) {
                const item = this.cartItems.find(item => item.type === productType);
                if (item && item.quantity > 1) {
                    item.quantity--;
                    this.updateCartCount();
                }
            },
            
             removeFromCart: function(productType) {
                this.cartItems = this.cartItems.filter(item => item.type !== productType);
                this.updateCartCount();
                
                // Masquer le badge si panier vide
                if (this.cartItemsCount === 0) {
                    const badge = document.querySelector('.cart-badge');
                    if (badge) {
                        badge.style.transform = 'scale(0)';
                        setTimeout(() => {
                            badge.classList.remove('show');
                            badge.style.transform = '';
                        }, 300);
                    }
                }
                
                console.log(`❌ Produit ${productType} supprimé du panier`);
            },
                    
            updateCartCount: function() {
                const oldCount = this.cartItemsCount;
                this.cartItemsCount = this.cartItems.reduce((total, item) => total + item.quantity, 0);
                
                console.log('📊 Mise à jour compteur panier:', oldCount, '->', this.cartItemsCount);
                
                // Sauvegarder seulement si le panier est chargé
                if (this.cartLoaded) {
                    this.saveCartToStorage();
                }
            },


            saveCartToStorage: function() {
                if (this.cartLoaded) {
                    localStorage.setItem('lv9dreams_cart', JSON.stringify(this.cartItems));
                    localStorage.setItem('lv9dreams_cart_count', this.cartItemsCount.toString());
                    console.log('💾 Panier sauvegardé:', this.cartItems.length, 'types de produits');
                } else {
                    console.log('⏳ Panier pas encore chargé, pas de sauvegarde');
                }
            },


            loadCartFromStorage: function() {
                console.log('📥 Chargement du panier depuis localStorage...');
                
                const savedCart = localStorage.getItem('lv9dreams_cart');
                const savedCount = localStorage.getItem('lv9dreams_cart_count');
                
                if (savedCart) {
                    try {
                        this.cartItems = JSON.parse(savedCart);
                        console.log('✅ Panier chargé:', this.cartItems);
                    } catch (e) {
                        console.error('❌ Erreur chargement panier:', e);
                        this.cartItems = [];
                    }
                } else {
                    console.log('ℹ️ Aucun panier sauvegardé trouvé');
                    this.cartItems = [];
                }
                
                if (savedCount) {
                    this.cartItemsCount = parseInt(savedCount) || 0;
                } else {
                    // Recalculer le count si pas sauvegardé
                    this.cartItemsCount = this.cartItems.reduce((total, item) => total + item.quantity, 0);
                }
                
                console.log('🔢 Nombre d\'articles dans le panier:', this.cartItemsCount);
                
                this.cartLoaded = true;
                
                // Afficher le badge si panier non vide
                this.$nextTick(() => {
                    const badge = document.querySelector('.cart-badge');
                    if (badge && this.cartItemsCount > 0) {
                        badge.classList.add('show');
                        console.log('🏷️ Badge du panier affiché');
                    }
                });
            },
            
            clearCart: function() {
                if (this.cartItems.length === 0) return;
                this.cartItems = [];
                this.cartItemsCount = 0;
                this.saveCartToStorage();
                // Masquer le badge avec animation
                        const badge = document.querySelector('.cart-badge');
                        if (badge) {
                            badge.style.transform = 'scale(0)';
                            setTimeout(() => {
                                badge.classList.remove('show');
                                badge.style.transform = '';
                            }, 300);
                        }
                        
                        console.log('🗑️ Panier vidé');         
                             
                        
                
            },


            getCartTotal: function() {
                return this.cartItems.reduce((total, item) => {
                    return total + (item.price * item.quantity);
                }, 0).toFixed(2);
            },

            // NOUVELLE fonction pour aller au checkout
            goToCheckout: function() {
                if (this.cartItems.length === 0) {
                    // Animation de "secousse" du panier vide SEULEMENT
                    const cartBtn = document.querySelector('.cart-toggle');
                    if (cartBtn) {
                        cartBtn.style.animation = 'shake 0.5s ease-in-out';
                        setTimeout(() => {
                            cartBtn.style.animation = '';
                        }, 500);
                    }
                    
                    // SUPPRIMÉ : this.showDiscreteNotification('empty');
                    return;
                }
                
                // Sauvegarder le panier pour la page de commande
                localStorage.setItem('lv9dreams_checkout_cart', JSON.stringify(this.cartItems));
                
                this.closeCart();
                
                // Petite pause pour l'animation de fermeture
                setTimeout(() => {
                    window.location.href = './order';
                }, 100);
            },


             addToCartQuick: function(productType) {
                this.addToCart(productType, 1);
                
                // Animation du panier
                const cartIcon = document.querySelector('.cart-toggle');
                if (cartIcon) {
                    cartIcon.classList.add('clicked');
                    setTimeout(() => {
                        cartIcon.classList.remove('clicked');
                    }, 300);
                }
            },
                    
            // Fonctions d'affichage du panier (à implémenter selon vos besoins)
            showCartSidebar: function() {
                // TODO: Afficher une sidebar ou popup avec le contenu du panier
                console.log('Affichage du panier avec', this.cartItems.length, 'produits');
            },
            
            hideCartSidebar: function() {
                // TODO: Masquer la sidebar ou popup
                console.log('Masquage du panier');
            },


            goToOrder: function(productType = null) {
                if (productType) {
                    // Avec pré-sélection du produit
                    window.location.href = `./order?product=${productType}`;
                } else {
                    // Sans pré-sélection
                    window.location.href = './order';
                }
            },


            goHome: function() {
                location.href = "/home"
            },



            submitForm: function() {
                // Reset des états
                this.submitError = null;
                this.submitSuccess = false;
                this.isSubmitting = true;

                // Validation basique
                if (!this.contactForm.firstName || !this.contactForm.lastName || 
                    !this.contactForm.email || !this.contactForm.message || 
                    !this.contactForm.privacy) {
                    this.submitError = "Veuillez remplir tous les champs obligatoires.";
                    this.isSubmitting = false;
                    return;
                }

                // Validation email
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(this.contactForm.email)) {
                    this.submitError = "Veuillez saisir une adresse email valide.";
                    this.isSubmitting = false;
                    return;
                }

                // ENVOI RÉEL vers ton serveur (plus de simulation !)
                fetch('/api/contact', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(this.contactForm)
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        this.submitSuccess = true;
                        console.log('Email envoyé avec succès !');
                        setTimeout(() => {
                            this.resetContactForm();
                        }, 2000);
                    } else {
                        this.submitError = data.message || "Erreur lors de l'envoi";
                    }
                    this.isSubmitting = false;
                })
                .catch(error => {
                    console.error('Erreur:', error);
                    this.submitError = "Erreur de connexion. Veuillez réessayer.";
                    this.isSubmitting = false;
                });
            },

            // AJOUTER CETTE MÉTHODE pour reset le formulaire
            resetContactForm: function() {
                this.contactForm = {
                    subject: '',
                    firstName: '',
                    lastName: '',
                    email: '',
                    phone: '',
                    orderNumber: '',
                    message: '',
                    newsletter: false,
                    privacy: false
                };
                this.submitSuccess = false;
                this.submitError = null;
                this.isSubmitting = false;
            },
    
            toggleFaq: function(faqId) {
                if (this.activeFaq === faqId) {
                    this.activeFaq = null; // Fermer si déjà ouvert
                } else {
                    this.activeFaq = faqId; // Ouvrir celui cliqué
                }
            },

            // Méthode pour toggle le thème
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


            beforeDestroy: function() {
    // Nettoyer l'intervalle
    if (this.visitorStatsInterval) {
        clearInterval(this.visitorStatsInterval);
    }
    
    // Déconnecter Socket.IO
    if (this.socket) {
        this.socket.disconnect();
    }
},

            // Exemple pour ouvrir un produit
            openProduct: function(productId) {
                this.selectedProduct = productId;
                console.log(`Produit ${productId} sélectionné`);
            }
        },


        mounted: function() {
            this.loadCartFromStorage();
            this.initVisitorCounter();

  
        },
    });

        // Smooth scrolling pour les liens d'ancrage
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                e.preventDefault();
                const target = document.querySelector(this.getAttribute('href'));
                if (target) {
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            });
        });

        // Effet parallax léger sur le hero
        window.addEventListener('scroll', () => {
            const scrolled = window.pageYOffset;
            const hero = document.querySelector('.hero');
            const heroContent = document.querySelector('.hero-content');
            
            if (hero) {
                hero.style.transform = `translateY(${scrolled * 0.5}px)`;
            }
            
            // Faire disparaître le contenu plus rapidement
            if (heroContent) {
                const opacity = Math.max(0, 1 - (scrolled / (window.innerHeight * 0.6)));
                const translateY = scrolled * 0.8;
                heroContent.style.opacity = opacity;
                heroContent.style.transform = `translateY(${translateY}px)`;
            }
        });


        let bigProductsLeft = null;
        let bigProductsRight = null;
        let lastScrollTop = 0;

        // Charger le thème sauvegardé
        document.addEventListener('DOMContentLoaded', () => {
            const savedTheme = localStorage.getItem('theme');
            const themeIcon = document.querySelector('.theme-icon');
            
            
            if (savedTheme === 'light') {
                document.body.classList.add('light-mode');
                if (themeIcon) themeIcon.textContent = '☀️';
            }

            // Initialisation des boxes avec vérification
            bigProductsLeft = document.querySelector('.big-products.left');
            bigProductsRight = document.querySelector('.big-products.right');
            
            if (bigProductsLeft || bigProductsRight) {
                // Throttle pour améliorer les performances
                let scrollTimeout;
                window.addEventListener('scroll', () => {
                    if (scrollTimeout) {
                        clearTimeout(scrollTimeout);
                    }
                    scrollTimeout = setTimeout(handleBigProductsScroll, 10);
                });
            }


             const previewText = document.getElementById('previewText');
            const previewContainer = document.getElementById('previewContainer');
            
            // Vérifier que les éléments existent
            if (!previewText || !previewContainer) {
                return;
            }
            
            let scrollStartTime = null;
            let maxScrollReached = 0;
            let isBlocked = false;
            let lastScrollTop = 0; // Pour détecter la direction du scroll

            previewText.addEventListener('scroll', function(e) {
                const currentTime = Date.now();
                const currentScrollTop = this.scrollTop;
                
                // Première fois qu'on scroll
                if (scrollStartTime === null) {
                    scrollStartTime = currentTime;
                    console.log('🔥 Début du scroll de l\'extrait eBook');
                }
                
                // Calculer le temps écoulé depuis le premier scroll
                const timeElapsed = currentTime - scrollStartTime;
                
                // Si moins d'1 seconde, autoriser le scroll et mémoriser la position max
                if (timeElapsed < 1000) {
                    maxScrollReached = Math.max(maxScrollReached, currentScrollTop);
                    lastScrollTop = currentScrollTop;
                } else {
                    // Après 1 seconde, gérer le blocage
                    const scrollDirection = currentScrollTop - lastScrollTop;
                    
                    // Si on scroll vers le bas (scrollDirection > 0) ET qu'on dépasse la limite
                    if (scrollDirection > 0 && currentScrollTop > maxScrollReached) {
                        // Bloquer en remettant à la position max
                        this.scrollTop = maxScrollReached;
                        return;
                    }
                    
                    // Activer l'effet de flou si pas déjà fait
                    if (!isBlocked) {
                        isBlocked = true;
                        previewContainer.classList.add('blocked');
                        console.log('🔒 Extrait eBook bloqué - remontée libre !');
                        
                        // Petite vibration pour signaler le blocage
                        if (navigator.vibrate) {
                            navigator.vibrate(50);
                        }
                    }
                    
                    // Mettre à jour la dernière position SEULEMENT si c'est autorisé
                    if (currentScrollTop <= maxScrollReached) {
                        lastScrollTop = currentScrollTop;
                    }
                }
            });

            // Gestion wheel (scroll souris) - Version simplifiée et plus fiable
            previewText.addEventListener('wheel', function(e) {
                if (isBlocked) {
                    // e.deltaY > 0 = scroll vers le bas
                    // e.deltaY < 0 = scroll vers le haut
                    
                    if (e.deltaY > 0 && this.scrollTop >= maxScrollReached) {
                        // Scroll vers le bas bloqué
                        e.preventDefault();
                        e.stopPropagation();
                        
                        // Effet visuel pour indiquer le blocage
                        previewContainer.style.transform = 'scale(0.998)';
                        setTimeout(() => {
                            previewContainer.style.transform = 'scale(1)';
                        }, 100);
                        
                        return false;
                    }
                    // Scroll vers le haut toujours autorisé (ne rien faire)
                }
            }, { passive: false });

            // Gestion tactile pour mobile - Version simplifiée
            let touchStartY = 0;
            let touchStartScrollTop = 0;

            previewText.addEventListener('touchstart', function(e) {
                touchStartY = e.touches[0].clientY;
                touchStartScrollTop = this.scrollTop;
            }, { passive: true });

            previewText.addEventListener('touchmove', function(e) {
                if (isBlocked) {
                    const touchY = e.touches[0].clientY;
                    const touchDelta = touchStartY - touchY; // Positif = swipe vers le bas
                    const currentScrollTop = this.scrollTop;
                    
                    // Si on swipe vers le bas ET qu'on est déjà à la limite
                    if (touchDelta > 5 && touchStartScrollTop >= maxScrollReached) {
                        e.preventDefault();
                        return false;
                    }
                }
            }, { passive: false });

            // Debug amélioré
            previewText.addEventListener('scroll', function() {
                if (isBlocked) {
                    console.log(`📍 Position: ${this.scrollTop.toFixed(0)} / Max: ${maxScrollReached.toFixed(0)} / Direction: ${this.scrollTop - lastScrollTop > 0 ? '⬇️' : '⬆️'}`);
                }
            });
        });


        function openProduct(productId) {
            alert(`Produit ${productId} cliqué ! (À remplacer par la navigation)`);
        }

        // Cacher les produits au scroll
        window.addEventListener('scroll', () => {
            const scrolled = window.pageYOffset;
            const products = document.querySelectorAll('.floating-products');
            
            if (scrolled > window.innerHeight * 0.7) {
                products.forEach(product => product.classList.add('hidden'));
            } else {
                products.forEach(product => product.classList.remove('hidden'));
            }
        });

        particlesJS('particles-js', {
            particles: {
                number: {
                    value: 80,
                    density: {
                        enable: true,
                        value_area: 800
                    }
                },
                color: {
                    value: ['#d4af37', '#ffd700', '#ffed4e', '#f59e0b']
                },
                shape: {
                    type: 'circle'
                },
                opacity: {
                    value: 0.5,
                    random: true,
                    anim: {
                        enable: true,
                        speed: 1,
                        opacity_min: 0.1,
                        sync: false
                    }
                },
                size: {
                    value: 3,
                    random: true,
                    anim: {
                        enable: true,
                        speed: 2,
                        size_min: 0.1,
                        sync: false
                    }
                },
                line_linked: {
                    enable: false
                },
                move: {
                    enable: true,
                    speed: 2,
                    direction: 'none',
                    random: false,
                    straight: false,
                    out_mode: 'out',
                    bounce: false,
                    attract: {
                        enable: false,
                        rotateX: 600,
                        rotateY: 1200
                    }
                }
            },
            interactivity: {
                detect_on: 'canvas',
                events: {
                    onhover: {
                        enable: true,
                        mode: 'repulse'
                    },
                    onclick: {
                        enable: true,
                        mode: 'push'
                    },
                    resize: true
                },
                modes: {
                    grab: {
                        distance: 140,
                        line_linked: {
                            opacity: 1
                        }
                    },
                    bubble: {
                        distance: 400,
                        size: 40,
                        duration: 2,
                        opacity: 8,
                        speed: 3
                    },
                    repulse: {
                        distance: 200,
                        duration: 0.4
                    },
                    push: {
                        particles_nb: 8
                    }
                }
            },
            retina_detect: true
        });


        let mouseTrail = [];
        let isMouseMoving = false;

        document.addEventListener('mousemove', (e) => {
            isMouseMoving = true;
            
            // Créer la traînée principale
            createTrailParticle(e.clientX, e.clientY);
            
            // Créer des particules de poussière occasionnellement
            if (Math.random() < 0.3) {
                createDustParticle(e.clientX, e.clientY);
            }
            
            // Créer des étincelles occasionnellement
            if (Math.random() < 0.1) {
                createSparkle(e.clientX, e.clientY);
            }
        });

        function createTrailParticle(x, y) {
            const trail = document.createElement('div');
            trail.className = 'mouse-trail';
            trail.style.left = (x - 4) + 'px';
            trail.style.top = (y - 4) + 'px';
            
            // Variation aléatoire de position
            const offsetX = (Math.random() - 0.5) * 10;
            const offsetY = (Math.random() - 0.5) * 10;
            trail.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
            
            document.body.appendChild(trail);
            
            // Supprimer après animation
            setTimeout(() => {
                if (trail.parentNode) {
                    trail.parentNode.removeChild(trail);
                }
            }, 800);
        }

        function createDustParticle(x, y) {
            const dust = document.createElement('div');
            dust.className = 'dust-particle';
            
            // Position aléatoire autour de la souris
            const offsetX = (Math.random() - 0.5) * 20;
            const offsetY = (Math.random() - 0.5) * 20;
            
            dust.style.left = (x + offsetX) + 'px';
            dust.style.top = (y + offsetY) + 'px';
            
            document.body.appendChild(dust);
            
            // Supprimer après animation
            setTimeout(() => {
                if (dust.parentNode) {
                    dust.parentNode.removeChild(dust);
                }
            }, 2000);
        }

        function createSparkle(x, y) {
            const sparkle = document.createElement('div');
            sparkle.className = 'mouse-trail sparkle';
            
            // Position aléatoire autour de la souris
            const offsetX = (Math.random() - 0.5) * 15;
            const offsetY = (Math.random() - 0.5) * 15;
            
            sparkle.style.left = (x + offsetX) + 'px';
            sparkle.style.top = (y + offsetY) + 'px';
            
            document.body.appendChild(sparkle);
            
            // Supprimer après animation
            setTimeout(() => {
                if (sparkle.parentNode) {
                    sparkle.parentNode.removeChild(sparkle);
                }
            }, 1200);
        }


        function handleBigProductsScroll() {
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            const heroSection = document.querySelector('.hero');
            const heroHeight = heroSection ? heroSection.offsetHeight : 0;
            
            // Seuil plus bas pour une disparition plus naturelle
            const threshold = heroHeight * 0.2; // 20% au lieu de 30%
            
            // Masquer les boxes quand on scroll vers le bas
            if (scrollTop > threshold) {
                if (bigProductsLeft && !bigProductsLeft.classList.contains('hidden')) {
                    bigProductsLeft.classList.add('hidden');
                }
                if (bigProductsRight && !bigProductsRight.classList.contains('hidden')) {
                    bigProductsRight.classList.add('hidden');
                }
            } else {
                if (bigProductsLeft && bigProductsLeft.classList.contains('hidden')) {
                    bigProductsLeft.classList.remove('hidden');
                }
                if (bigProductsRight && bigProductsRight.classList.contains('hidden')) {
                    bigProductsRight.classList.remove('hidden');
                }
            }
            
            lastScrollTop = scrollTop;
        }
