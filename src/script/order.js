//order.js ici

var app = new Vue({
    el: '#app',
    
    data: function() {
        return {
            // Données du formulaire de commande
            orderForm: {
                firstName: '',
                lastName: '',
                email: '',
                phone: '',
                address: '',
                postalCode: '',
                city: '',
                country: '',
                notes: '',
                paymentMethod: 'stripe',
            },
            
            
            // États de soumission
            isSubmitting: false,
            orderSuccess: false,
            orderError: null,


            stripe: null,
            elements: null,
            cardElement: null,
            stripeLoading: false,
            paymentIntentClientSecret: null,
            
            // Données des produits (fallback)
            products: {
                resine: {
                    name: 'Shilajit Résine Pur',
                    price: 19.99,
                    oldPrice: 29.99,
                    description: 'Résine pure et authentique récoltée en haute altitude'
                },
                gelules: {
                    name: 'Shilajit Gélules Pur',
                    price: 16.99,
                    oldPrice: 25.99,
                    description: 'Gélules pratiques et dosées avec précision'
                },
                // NOUVEAU : Ajouter l'eBook
                 ebook: {
                    name: 'LV9 Code - Guide Ultime du Succès',
                    price: 14.99,
                    oldPrice: null,
                    description: 'eBook de développement personnel et stratégies de réussite'
                }
            },
            
            // Thème
            currentTheme: 'dark',
            
            // NOUVEAU : Données du panier chargées depuis localStorage
            cartItems: [],
            cartItemsCount: 0,
            cartClicked: false,
            isCartOpen: false,
            showCardBack: false,
        }
    },

    methods: {
         async initStripe() {
    try {
        console.log('💳 Initialisation de Stripe...');
        
        // 1. Récupérer la clé publique depuis le serveur
        const response = await fetch('/api/stripe-config');
        const config = await response.json();
        
        if (!config.success) {
            throw new Error('Impossible de récupérer la configuration Stripe');
        }
        
        console.log('✅ Configuration Stripe récupérée');
        
        // 2. Initialiser Stripe - ATTENDRE QUE CE SOIT COMPLÈTEMENT CHARGÉ
        this.stripe = Stripe(config.publishableKey);
        
        // ATTENDRE que Stripe soit complètement initialisé
        await new Promise(resolve => setTimeout(resolve, 500));
        console.log('✅ Stripe initialisé');
        
        // 3. Créer les éléments avec style sombre
        this.elements = this.stripe.elements({
            appearance: {
                theme: 'night',
                variables: {
                    colorPrimary: '#d4af37',
                    colorBackground: 'rgba(255, 255, 255, 0.08)',
                    colorText: '#ffffff',
                    colorDanger: '#e74c3c',
                    fontFamily: 'Inter, system-ui, sans-serif',
                    spacingUnit: '4px',
                    borderRadius: '8px',
                },
                rules: {
                    '.Input': {
                        height: '56px',
                        boxSizing: 'border-box',
                        padding: '1.2rem'
                    }
                }
            }
        });
        console.log('✅ Elements créé avec thème personnalisé');
        
        // 4. Créer les éléments individuels
        this.createStripeElements();
        
        // 5. FORCER le montage après un délai plus long
        setTimeout(() => {
            this.mountStripeElements();
        }, 1000); // Augmenter le délai
        
    } catch (error) {
        console.error('❌ Erreur initStripe:', error);
        this.orderError = 'Erreur de chargement du système de paiement: ' + error.message;
    }
},


        createStripeElements() {
            const elementStyle = {
                style: {
                    base: {
                        fontSize: '16px',
                        color: '#ffffff',
                        fontFamily: 'Inter, system-ui, sans-serif',
                        '::placeholder': {
                            color: '#aab7c4',
                        },
                    },
                    invalid: {
                        color: '#e74c3c',
                    },
                }
            };

            // Créer les éléments séparés
            this.cardNumberElement = this.elements.create('cardNumber', {
                ...elementStyle,
                placeholder: '1234 5678 9012 3456'
            });
            
            this.cardExpiryElement = this.elements.create('cardExpiry', elementStyle);
            
            this.cardCvcElement = this.elements.create('cardCvc', {
                ...elementStyle,
                placeholder: '123'
            });
            
            console.log('✅ Éléments Stripe créés');
        },


mountStripeElements() {
    try {
        console.log('🔄 Montage des éléments Stripe...');
        
        // Vérifier que les conteneurs existent ET sont visibles
        const containers = {
            number: document.getElementById('stripe-card-number'),
            expiry: document.getElementById('stripe-card-expiry'),
            cvc: document.getElementById('stripe-card-cvc')
        };
        
        // Vérifier la visibilité des conteneurs
        const stripeForm = document.querySelector('.stripe-payment-form');
        if (!stripeForm || getComputedStyle(stripeForm).display === 'none') {
            console.log('⏳ Formulaire Stripe pas visible, réessai...');
            setTimeout(() => this.mountStripeElements(), 1000);
            return;
        }
        
        console.log('Conteneurs trouvés:', {
            number: !!containers.number && containers.number.offsetParent !== null,
            expiry: !!containers.expiry && containers.expiry.offsetParent !== null,
            cvc: !!containers.cvc && containers.cvc.offsetParent !== null
        });
        
        if (!containers.number || !containers.expiry || !containers.cvc) {
            throw new Error('Conteneurs Stripe non trouvés');
        }
        
        // Vider les conteneurs avant de monter
        containers.number.innerHTML = '';
        containers.expiry.innerHTML = '';
        containers.cvc.innerHTML = '';
        
        // Monter les éléments
        this.cardNumberElement.mount('#stripe-card-number');
        this.cardExpiryElement.mount('#stripe-card-expiry');
        this.cardCvcElement.mount('#stripe-card-cvc');
        
        console.log('✅ Éléments Stripe montés avec succès');
        
        // Configurer la gestion d'erreurs
        this.setupStripeErrorHandling();
        
    } catch (error) {
        console.error('❌ Erreur montage Stripe:', error);
        this.orderError = 'Erreur lors du montage des champs de carte';
        
        // Réessayer après un délai plus long
        setTimeout(() => {
            if (this.orderForm.paymentMethod === 'stripe') {
                console.log('🔄 Nouvelle tentative de montage...');
                this.mountStripeElements();
            }
        }, 2000);
    }
},


         setupStripeErrorHandling() {
            // Erreurs numéro de carte
            this.cardNumberElement.on('change', ({ error }) => {
                const errorElement = document.getElementById('stripe-card-number-error');
                if (errorElement) {
                    errorElement.textContent = error ? this.translateStripeError(error.message) : '';
                }
            });
            
            // Erreurs date d'expiration
            this.cardExpiryElement.on('change', ({ error }) => {
                const errorElement = document.getElementById('stripe-card-expiry-error');
                if (errorElement) {
                    errorElement.textContent = error ? this.translateStripeError(error.message) : '';
                }
            });
            
            // Erreurs CVC
            this.cardCvcElement.on('change', ({ error }) => {
                const errorElement = document.getElementById('stripe-card-cvc-error');
                if (errorElement) {
                    errorElement.textContent = error ? this.translateStripeError(error.message) : '';
                }
            });
            
            console.log('✅ Gestion d\'erreurs Stripe configurée');

             setTimeout(() => {
        console.log('🧪 DEBUG STRIPE FIELDS:');
        
        // Vérifier les iframes Stripe
        const stripeFrames = document.querySelectorAll('iframe[name^="__privateStripeFrame"]');
        console.log('📱 Iframes Stripe trouvées:', stripeFrames.length);
        
        stripeFrames.forEach((frame, index) => {
            console.log(`Frame ${index}:`, {
                name: frame.name,
                src: frame.src,
                style: frame.style.cssText,
                clientWidth: frame.clientWidth,
                clientHeight: frame.clientHeight
            });
        });
        
        // Vérifier les conteneurs
        const containers = [
            'stripe-card-number',
            'stripe-card-expiry', 
            'stripe-card-cvc'
        ];
        
        containers.forEach(id => {
            const container = document.getElementById(id);
            if (container) {
                console.log(`📦 Container ${id}:`, {
                    exists: true,
                    visible: container.offsetParent !== null,
                    width: container.offsetWidth,
                    height: container.offsetHeight,
                    children: container.children.length,
                    innerHTML: container.innerHTML.length > 0 ? 'Has content' : 'Empty'
                });
            }
        });
        
        // Tester l'interactivité
        console.log('🎯 Test focus sur le champ numéro...');
        const numberContainer = document.getElementById('stripe-card-number');
        if (numberContainer) {
            const iframe = numberContainer.querySelector('iframe');
            if (iframe) {
                iframe.focus();
                console.log('✅ Focus appliqué sur iframe');
            }
        }
        
    }, 3000); 
        },

        // Méthode pour traduire les erreurs Stripe en français
        translateStripeError(errorMessage) {
            const translations = {
                'Your card number is incomplete.': 'Le numéro de carte est incomplet.',
                'Your card\'s expiration date is incomplete.': 'La date d\'expiration est incomplète.',
                'Your card\'s security code is incomplete.': 'Le code de sécurité est incomplet.',
                'Your card number is invalid.': 'Le numéro de carte est invalide.',
                'Your card has expired.': 'Votre carte a expiré.',
                'Your card\'s security code is invalid.': 'Le code de sécurité est invalide.',
                'Your card was declined.': 'Votre carte a été refusée.',
                'Your card does not support this type of purchase.': 'Votre carte ne supporte pas ce type d\'achat.'
            };
            
            return translations[errorMessage] || errorMessage;
        },

        selectPaymentMethod: function(method) {
    console.log('💳 Sélection méthode:', method);
    this.orderForm.paymentMethod = method;
    
    if (method === 'stripe') {
        // Attendre que le DOM se mette à jour
        this.$nextTick(() => {
            setTimeout(() => {
                // Si Stripe n'est pas initialisé, le faire maintenant
                if (!this.stripe) {
                    console.log('🔄 Initialisation Stripe après sélection...');
                    this.initStripe();
                } else if (!this.cardNumberElement || !this.cardNumberElement._mounted) {
                    console.log('🔄 Éléments Stripe non montés, remontage...');
                    this.createStripeElements();
                    setTimeout(() => this.mountStripeElements(), 500);
                } else {
                    console.log('🔄 Remontage éléments Stripe existants...');
                    this.remountStripeElements();
                }
            }, 500); // Délai plus long
        });
    }
},

forceStripeInit: function() {
    console.log('🔄 FORCE INIT STRIPE...');
    
    // Nettoyer d'abord
    if (this.cardNumberElement) {
        try { this.cardNumberElement.unmount(); } catch(e) {}
    }
    if (this.cardExpiryElement) {
        try { this.cardExpiryElement.unmount(); } catch(e) {}
    }
    if (this.cardCvcElement) {
        try { this.cardCvcElement.unmount(); } catch(e) {}
    }
    
    // Réinitialiser
    this.stripe = null;
    this.elements = null;
    this.cardNumberElement = null;
    this.cardExpiryElement = null;
    this.cardCvcElement = null;
    
    // Relancer après un délai
    setTimeout(() => {
        this.initStripe();
    }, 500);
},

        remountStripeElements() {
            console.log('🔄 Remontage forcé des éléments Stripe...');
            
            try {
                // Démonter les éléments existants s'ils existent
                if (this.cardNumberElement) {
                    try { this.cardNumberElement.unmount(); } catch (e) {}
                }
                if (this.cardExpiryElement) {
                    try { this.cardExpiryElement.unmount(); } catch (e) {}
                }
                if (this.cardCvcElement) {
                    try { this.cardCvcElement.unmount(); } catch (e) {}
                }
                
                // Remonter après un petit délai
                setTimeout(() => {
                    this.mountStripeElements();
                }, 100);
                
            } catch (error) {
                console.error('❌ Erreur remontage:', error);
            }
        },

        async createPaymentIntent() {
    try {
        console.log('💳 Création Payment Intent - Données envoyées:', {
            amount: parseFloat(this.getCartTotal()),
            currency: 'eur',
            customerEmail: this.orderForm.email,
            productsCount: this.cartItems.length
        });
        
        const response = await fetch('/api/create-payment-intent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                amount: parseFloat(this.getCartTotal()),
                currency: 'eur',
                orderData: {
                    customer: this.orderForm,
                    products: this.cartItems
                }
            })
        });
        
        // VÉRIFIER LE STATUT HTTP
        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Erreur HTTP:', response.status, errorText);
            throw new Error(`Erreur serveur (${response.status}): ${errorText}`);
        }
        
        const data = await response.json();
        console.log('📡 Réponse serveur Payment Intent:', data);
        
        if (!data.success) {
            console.error('❌ Échec Payment Intent:', data);
            throw new Error(data.message || 'Erreur lors de la création du paiement');
        }
        
        this.paymentIntentClientSecret = data.clientSecret;
        console.log('✅ Payment Intent créé avec succès');
        
        return data;
        
    } catch (error) {
        console.error('❌ Erreur createPaymentIntent complète:', error);
        
        // Messages d'erreur plus spécifiques
        if (error.message.includes('500')) {
            throw new Error('Erreur serveur. Veuillez réessayer dans quelques instants.');
        } else if (error.message.includes('network')) {
            throw new Error('Problème de connexion. Vérifiez votre internet.');
        } else {
            throw error;
        }
    }
},


        // NOUVEAU : Formater le numéro de carte
        formatCardInput: function(event) {
            let value = event.target.value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
            let formattedValue = value.match(/.{1,4}/g)?.join(' ') || value;
            
            if (formattedValue.length <= 19) {
                this.orderForm.cardNumber = formattedValue;
            }
            
            event.target.value = formattedValue;
        },

        // NOUVEAU : Formater la date d'expiration
        formatExpiryInput: function(event) {
            let value = event.target.value.replace(/\D/g, '');
            
            if (value.length >= 2) {
                value = value.substring(0, 2) + '/' + value.substring(2, 4);
            }
            
            this.orderForm.cardExpiry = value;
            event.target.value = value;
        },

        // NOUVEAU : Formater l'affichage du numéro de carte
        formatCardNumber: function(number) {
            if (!number) return '';
            return number.replace(/(.{4})/g, '$1 ').trim();
        },

        // NOUVEAU : Détecter le type de carte
        getCardBrand: function(number) {
            if (!number) return '';
            
            const cleaned = number.replace(/\s/g, '');
            
            if (/^4/.test(cleaned)) return 'Visa';
            if (/^5[1-5]/.test(cleaned) || /^2[2-7]/.test(cleaned)) return 'Mastercard';
            if (/^3[47]/.test(cleaned)) return 'Amex';
            
            return '';
        },

        validateForm: function() {
            this.orderError = null;

            // Vérifier que le panier n'est pas vide
            if (this.cartItems.length === 0) {
                this.orderError = "Votre panier est vide.";
                return false;
            }

            // Vérifier les champs obligatoires
            const requiredFields = [
                'firstName', 'lastName', 'email', 'phone', 
                'address', 'postalCode', 'city', 'country'
            ];

            for (let field of requiredFields) {
                if (!this.orderForm[field] || this.orderForm[field].trim() === '') {
                    this.orderError = `Le champ "${this.getFieldLabel(field)}" est obligatoire.`;
                    return false;
                }
            }

            // Validation email
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(this.orderForm.email)) {
                this.orderError = "Veuillez saisir une adresse email valide.";
                return false;
            }

            // Validation téléphone
            const phoneRegex = /^[0-9\s\-\+\(\)]{10,}$/;
            if (!phoneRegex.test(this.orderForm.phone.replace(/\s/g, ''))) {
                this.orderError = "Veuillez saisir un numéro de téléphone valide.";
                return false;
            }

            // Validation code postal (France)
            if (this.orderForm.country === 'France') {
                const postalRegex = /^[0-9]{5}$/;
                if (!this.orderForm.postalCode || !postalRegex.test(this.orderForm.postalCode)) {
                    this.orderError = "Veuillez saisir un code postal français valide (5 chiffres).";
                    return false;
                }
            }

          

            return true;
        },

        loadTheme: function() {
            const savedTheme = localStorage.getItem('theme');
            const themeIcon = document.querySelector('.theme-icon');
            
            if (savedTheme === 'light') {
                this.currentTheme = 'light';
                document.body.classList.add('light-mode');
                if (themeIcon) themeIcon.textContent = '☀️';
            }
        },

        // NOUVEAU : Charger le panier depuis localStorage
        loadCartFromCheckout: function() {
            console.log('📥 Chargement du panier pour la commande...');
            
            const savedCart = localStorage.getItem('lv9dreams_cart');
            const savedCount = localStorage.getItem('lv9dreams_cart_count');
            
            if (savedCart) {
                try {
                    this.cartItems = JSON.parse(savedCart);
                    console.log('✅ Panier chargé pour commande:', this.cartItems);
                } catch (e) {
                    console.error('❌ Erreur chargement panier:', e);
                    this.cartItems = [];
                }
            }
            
            if (savedCount) {
                this.cartItemsCount = parseInt(savedCount);
            } else {
                this.cartItemsCount = this.cartItems.reduce((total, item) => total + item.quantity, 0);
            }
            
            // Si le panier est vide, rediriger vers l'accueil
            if (this.cartItems.length === 0) {
                setTimeout(() => {
                    window.location.href = './';
                }, 50);
                return;
            }
            
            console.log('🛒 Panier pour commande:', this.cartItems.length, 'types de produits');
        },

        // NOUVEAU : Sauvegarder les modifications du panier
        saveCartChanges: function() {
            localStorage.setItem('lv9dreams_cart', JSON.stringify(this.cartItems));
            this.cartItemsCount = this.cartItems.reduce((total, item) => total + item.quantity, 0);
            localStorage.setItem('lv9dreams_cart_count', this.cartItemsCount.toString());
        },

        increaseQuantity: function(productType) {
            const item = this.cartItems.find(item => item.type === productType);
            if (item && item.quantity < 10) {
                item.quantity++;
                this.saveCartChanges();
            }
        },

        decreaseQuantity: function(productType) {
            const item = this.cartItems.find(item => item.type === productType);
            if (item && item.quantity > 1) {
                item.quantity--;
                this.saveCartChanges();
            }
        },

        // NOUVEAU : Supprimer un produit du panier
        removeFromCart: function(productType) {
            this.cartItems = this.cartItems.filter(item => item.type !== productType);
            this.saveCartChanges();
            
            if (this.cartItems.length === 0) {
                setTimeout(() => {
                    window.location.href = './';
                }, 50);
            }
        },

        

        // Obtenir le label d'un champ pour les erreurs
        getFieldLabel: function(fieldName) {
            const labels = {
                firstName: 'Prénom',
                lastName: 'Nom',
                email: 'Email',
                phone: 'Téléphone',
                address: 'Adresse',
                postalCode: 'Code postal',
                city: 'Ville',
                country: 'Pays'
            };
            return labels[fieldName] || fieldName;
        },


        async processStripePayment() {
    console.log('💳 Traitement paiement Stripe...');
    
    try {
        // 1. Créer le Payment Intent
        const paymentIntentData = await this.createPaymentIntent();
        
        // 2. Confirmer le paiement avec Stripe
        const { error, paymentIntent } = await this.stripe.confirmCardPayment(
            this.paymentIntentClientSecret,
            {
                payment_method: {
                    card: this.cardNumberElement,
                    billing_details: {
                        email: this.orderForm.email,
                        phone: this.orderForm.phone,
                        address: {
                            line1: this.orderForm.address,
                            city: this.orderForm.city,
                            postal_code: this.orderForm.postalCode,
                            country: this.orderForm.country === 'France' ? 'FR' : 'FR'
                        }
                    }
                }
            }
        );
        
        // 3. Gérer les erreurs
        if (error) {
            console.error('❌ Erreur paiement Stripe:', error);
            throw new Error(this.translateStripeError(error.message));
        }
        
        // 4. Vérifier le succès
        if (paymentIntent.status === 'succeeded') {
            console.log('✅ Paiement Stripe réussi !');
            console.log('🔍 PaymentIntent reçu:', paymentIntent);
            
            // ✅ GESTION SÉCURISÉE DES CHARGES
            let cardLast4 = null;
            let cardBrand = null;
            let chargeId = null;
            
            // Vérifier si les charges existent et sont disponibles
            if (paymentIntent.charges && 
                paymentIntent.charges.data && 
                paymentIntent.charges.data.length > 0) {
                
                const charge = paymentIntent.charges.data[0];
                console.log('💳 Charge trouvée:', charge.id);
                
                chargeId = charge.id;
                
                // Vérifier payment_method_details
                if (charge.payment_method_details && 
                    charge.payment_method_details.card) {
                    
                    cardLast4 = charge.payment_method_details.card.last4;
                    cardBrand = charge.payment_method_details.card.brand;
                    
                    console.log('💳 Infos carte:', { cardLast4, cardBrand });
                } else {
                    console.log('⚠️ payment_method_details non disponibles');
                }
            } else {
                console.log('⚠️ Charges non disponibles immédiatement');
                
                // FALLBACK : Récupérer les infos via une requête séparée
                try {
                    const expandedPaymentIntent = await this.stripe.paymentIntents.retrieve(
                        paymentIntent.id,
                        { expand: ['charges.data.payment_method'] }
                    );
                    
                    if (expandedPaymentIntent.charges?.data?.[0]) {
                        const charge = expandedPaymentIntent.charges.data[0];
                        chargeId = charge.id;
                        cardLast4 = charge.payment_method_details?.card?.last4;
                        cardBrand = charge.payment_method_details?.card?.brand;
                        console.log('✅ Infos récupérées via expand:', { cardLast4, cardBrand });
                    }
                } catch (expandError) {
                    console.log('⚠️ Impossible de récupérer les détails étendus:', expandError.message);
                }
            }
            
            // 5. Sauvegarder la commande avec les infos disponibles
            await this.saveOrderToServer({
                payment: {
                    method: 'stripe',
                    paymentIntentId: paymentIntent.id,
                    chargeId: chargeId || `charge_${Date.now()}`, // Fallback si pas de charge ID
                    cardLast4: cardLast4 || 'xxxx', // Fallback si pas d'info carte
                    cardBrand: cardBrand || 'unknown', // Fallback si pas de brand
                    amount: paymentIntent.amount / 100,
                    currency: paymentIntent.currency.toUpperCase(),
                    status: 'succeeded'
                }
            });
            
            console.log('✅ Commande sauvegardée avec succès !');
        } else {
            throw new Error(`Statut de paiement inattendu: ${paymentIntent.status}`);
        }
        
    } catch (error) {
        console.error('❌ Erreur processStripePayment:', error);
        throw error;
    }
},

async getPaymentDetails(paymentIntentId) {
    try {
        // Cette méthode peut être appelée côté serveur pour plus de fiabilité
        const paymentIntent = await this.stripe.paymentIntents.retrieve(
            paymentIntentId,
            { expand: ['charges.data.payment_method'] }
        );
        
        return {
            chargeId: paymentIntent.charges?.data?.[0]?.id,
            cardLast4: paymentIntent.charges?.data?.[0]?.payment_method_details?.card?.last4,
            cardBrand: paymentIntent.charges?.data?.[0]?.payment_method_details?.card?.brand
        };
    } catch (error) {
        console.error('❌ Erreur récupération détails:', error);
        return {
            chargeId: null,
            cardLast4: null,
            cardBrand: null
        };
    }
},

        // === MÉTHODE PAYPAL ===
         async processPayPalPayment() {
    console.log('🅿️ Traitement paiement PayPal...');
    
    try {
        // 🧪 MODE SIMULATION POUR LOCAL
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            console.log('🧪 MODE SIMULATION PAYPAL LOCAL');
            
            // Simuler un délai de traitement PayPal
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Simuler un paiement PayPal réussi
            await this.saveOrderToServer({
                payment: {
                    method: 'paypal',
                    paypalOrderId: `FAKE-${Date.now()}`,
                    payerId: 'FAKE-PAYER-123',
                    captureId: `FAKE-CAPTURE-${Date.now()}`,
                    amount: parseFloat(this.getCartTotal()),
                    currency: 'EUR',
                    status: 'completed'
                }
            });
            
            console.log('✅ Simulation PayPal terminée !');
            return;
        }
        
        // 🔴 MODE RÉEL PAYPAL (pour production)
        // 1. Créer la commande PayPal
        const response = await fetch('/api/create-paypal-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                amount: parseFloat(this.getCartTotal()),
                currency: 'EUR',
                orderData: {
                    customer: this.orderForm,
                    products: this.cartItems
                }
            })
        });
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.message || 'Erreur création commande PayPal');
        }
        
        console.log('✅ Commande PayPal créée:', data.orderId);
        
        // 2. Sauvegarder temporairement les données de commande
        sessionStorage.setItem('lv9_paypal_temp_order', JSON.stringify(data.tempOrderData));
        
        // 3. Rediriger vers PayPal pour le paiement
        console.log('🔄 Redirection vers PayPal...');
        window.location.href = data.approvalUrl;
        
    } catch (error) {
        console.error('❌ Erreur processPayPalPayment:', error);
        throw error;
    }
},

async checkPayPalStatus(orderId) {
    try {
        const response = await fetch(`/api/paypal-order-status/${orderId}`);
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('❌ Erreur vérification PayPal:', error);
        return { success: false, error: error.message };
    }
},

        // === MÉTHODE HELPER: CRÉER ORDRE PAYPAL ===
        async createPayPalOrder() {
            try {
                const response = await fetch('/api/create-paypal-order', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        amount: parseFloat(this.getCartTotal()),
                        currency: 'EUR',
                        orderData: {
                            customer: this.orderForm,
                            products: this.cartItems
                        },
                        returnUrl: `${window.location.origin}/paypal-success`,
                        cancelUrl: `${window.location.origin}/paypal-cancel`
                    })
                });
                
                const data = await response.json();
                
                if (!data.success) {
                    throw new Error(data.message || 'Erreur création ordre PayPal');
                }
                
                console.log('✅ Ordre PayPal créé:', data.orderId);
                return data.order;
                
            } catch (error) {
                console.error('❌ Erreur createPayPalOrder:', error);
                throw error;
            }
        },

        // === MÉTHODE HELPER: FINALISER PAYPAL (à appeler depuis une page de retour) ===
        async finalizePayPalPayment(paypalOrderId, payerId) {
            try {
                console.log('✅ Finalisation paiement PayPal...');
                
                // 1. Capturer le paiement PayPal
                const response = await fetch('/api/capture-paypal-order', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        orderId: paypalOrderId,
                        payerId: payerId
                    })
                });
                
                const data = await response.json();
                
                if (!data.success) {
                    throw new Error(data.message || 'Erreur capture PayPal');
                }
                
                // 2. Récupérer les données de commande sauvegardées
                const pendingOrder = JSON.parse(sessionStorage.getItem('lv9_pending_order') || '{}');
                
                if (!pendingOrder.customer) {
                    throw new Error('Données de commande introuvables');
                }
                
                // 3. Sauvegarder la commande avec les infos PayPal
                await this.saveOrderToServer({
                    payment: {
                        method: 'paypal',
                        paypalOrderId: paypalOrderId,
                        payerId: payerId,
                        captureId: data.captureId,
                        amount: pendingOrder.total,
                        currency: 'EUR',
                        status: 'completed'
                    }
                }, pendingOrder);
                
                // 4. Nettoyer les données temporaires
                sessionStorage.removeItem('lv9_pending_order');
                
                console.log('✅ Commande PayPal finalisée avec succès !');
                return true;
                
            } catch (error) {
                console.error('❌ Erreur finalizePayPalPayment:', error);
                throw error;
            }
        },

        // === MÉTHODE AMÉLIORÉE: SAUVEGARDE COMMANDE ===
        async saveOrderToServer(paymentData, orderOverride = null) {
            try {
                const orderData = {
                    customer: orderOverride ? orderOverride.customer : { ...this.orderForm },
                    products: orderOverride ? orderOverride.products : this.cartItems.map(item => ({
                        type: item.type,
                        name: item.name,
                        price: item.price,
                        oldPrice: item.oldPrice,
                        quantity: item.quantity
                    })),
                    payment: paymentData.payment,
                    subtotal: orderOverride ? orderOverride.total : this.getCartTotal(),
                    shipping: 0,
                    total: orderOverride ? orderOverride.total : this.getCartTotal(),
                    orderDate: new Date().toISOString()
                };
                
                console.log('💾 Sauvegarde commande sur le serveur...');
                
                // Envoyer au serveur
                const response = await fetch('/api/order', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(orderData)
                });
                
                const result = await response.json();
                
                if (result.success) {
                    this.orderSuccess = true;
                    console.log('✅ Commande enregistrée avec succès !');
                    console.log('📦 ID Commande:', result.orderId);
                    
                    // Vider le panier
                    localStorage.removeItem('lv9dreams_cart');
                    localStorage.removeItem('lv9dreams_cart_count');
                    
                    // Redirection après succès
                    setTimeout(() => {
                        this.redirectToThankYou(result.orderId);
                    }, 2000);
                    
                } else {
                    throw new Error(result.message || 'Erreur lors de l\'enregistrement');
                }
                
            } catch (error) {
                console.error('❌ Erreur saveOrderToServer:', error);
                throw error;
            }
        },

        

        // MODIFIÉ : Soumettre la commande avec tous les produits du panier
        async submitOrder() {
            if (!this.validateForm()) {
                return;
            }

            this.isSubmitting = true;
            this.orderSuccess = false;
            this.orderError = null;

            try {
                if (this.orderForm.paymentMethod === 'stripe') {
                    await this.processStripePayment();
                } else if (this.orderForm.paymentMethod === 'paypal') {
                    await this.processPayPalPayment();
                }
                
            } catch (error) {
                console.error('❌ Erreur soumission:', error);
                this.orderError = error.message || "Erreur lors du traitement. Veuillez réessayer.";
            }
            
            this.isSubmitting = false;
        },

        // Générer un numéro de commande unique
        generateOrderNumber: function() {
            const timestamp = Date.now();
            const random = Math.floor(Math.random() * 1000);
            return `LV9-${timestamp}-${random}`;
        },

        // NOUVEAU : Calculer le total du panier
        getCartTotal: function() {
            return this.cartItems.reduce((total, item) => {
                return total + (item.price * item.quantity);
            }, 0).toFixed(2);
        },

        // NOUVEAU : Calculer le total d'économies
        getTotalSavings: function() {
            return this.cartItems.reduce((total, item) => {
                if (item.oldPrice) {
                    return total + ((item.oldPrice - item.price) * item.quantity);
                }
                return total;
            }, 0).toFixed(2);
        },
        // Utilitaires
        redirectToThankYou: function(orderId) {
            setTimeout(() => {
                window.location.href = './';
            }, 50);
        },
        
        refreshPage: function() {
            window.location.reload();
        },

        goHome: function() {
            window.location.href = './';
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

        // Méthodes pour le panier (compatibilité)
        loadCartCount: function() {
            // Déjà géré dans loadCartFromCheckout
        },
        
        toggleCart: function() {
            this.isCartOpen = !this.isCartOpen;
        },
        


    },

  
        
    computed: {
        // Total formaté
            formattedTotal: function() {
                return this.getCartTotal();
            },

            // Économies totales
            totalSavings: function() {
                return this.getTotalSavings();
            },

            // VALIDATION : Informations client
            isCustomerInfoValid: function() {
            const requiredFields = ['firstName', 'lastName', 'email', 'phone', 'address', 'postalCode', 'city', 'country'];
            
            for (let field of requiredFields) {
                if (!this.orderForm[field] || this.orderForm[field].trim() === '') {
                    return false;
                }
            }
            
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(this.orderForm.email)) {
                return false;
            }

            const phoneRegex = /^[0-9\s\-\+\(\)]{10,}$/;
            if (!phoneRegex.test(this.orderForm.phone.replace(/\s/g, ''))) {
                return false;
            }

            if (this.orderForm.country === 'France') {
                const postalRegex = /^[0-9]{5}$/;
                if (!postalRegex.test(this.orderForm.postalCode)) {
                    return false;
                }
            }
            
            return true;
        },

            // VALIDATION : Paiement
            isPaymentValid: function() {
            if (!this.orderForm.paymentMethod) {
                return false;
            }

            if (this.orderForm.paymentMethod === 'stripe') {
                return !!this.cardNumberElement;
            }

            if (this.orderForm.paymentMethod === 'paypal') {
                return true;
            }

            return false;
        },

        // Formulaire complètement valide
        isFormCompletelyValid: function() {
            return this.cartItems.length > 0 && 
                this.isCustomerInfoValid && 
                this.isPaymentValid && 
                !this.isSubmitting;
        },

            // VALIDATION : Formulaire complet
            isFormCompletelyValid: function() {
                return this.cartItems.length > 0 && 
                    this.isCustomerInfoValid && 
                    this.isPaymentValid && 
                    !this.isSubmitting;
            },

            // MESSAGES : Aide dynamique
            validationMessage: function() {
            if (this.cartItems.length === 0) {
                return "Votre panier est vide";
            }
            
            if (!this.isCustomerInfoValid) {
                return "INFOS À COMPLÉTER ";
            }
            
            if (!this.isPaymentValid) {
                if (!this.orderForm.paymentMethod) {
                    return "Veuillez sélectionner un mode de paiement";
                }
            }
            
            return "Prêt à finaliser";
        },

                completionPercentage: function() {
                let completed = 0;
                let total = 3; // Panier + Infos + Paiement
                
                if (this.cartItems.length > 0) completed++;
                if (this.isCustomerInfoValid) completed++;
                if (this.isPaymentValid) completed++;
                
                return Math.round((completed / total) * 100);
            }
        

        },

        // Cycle de vie
        mounted: function() {
            console.log('🚀 Page commande initialisée');
            
            // Charger le thème
            this.loadTheme();
            
            // IMPORTANT : Charger le panier depuis localStorage
            this.loadCartFromCheckout();

            const initStripeWhenReady = () => {
        // Vérifier que Stripe SDK est chargé
        if (typeof Stripe === 'undefined') {
            console.log('⏳ Stripe SDK pas encore chargé, attente...');
            setTimeout(initStripeWhenReady, 500);
            return;
        }
        
        // Vérifier que les conteneurs DOM existent
        const containers = [
            document.getElementById('stripe-card-number'),
            document.getElementById('stripe-card-expiry'), 
            document.getElementById('stripe-card-cvc')
        ];
        
        const allContainersExist = containers.every(c => c !== null);
        
        if (!allContainersExist) {
            console.log('⏳ Conteneurs DOM pas encore prêts, attente...');
            setTimeout(initStripeWhenReady, 500);
            return;
        }
        
        // Vérifier que le formulaire Stripe est visible
        const stripeForm = document.querySelector('.stripe-payment-form');
        if (!stripeForm || getComputedStyle(stripeForm).display === 'none') {
            console.log('⏳ Formulaire Stripe pas encore visible, attente...');
            setTimeout(initStripeWhenReady, 500);
            return;
        }
        
        console.log('✅ Tout est prêt, initialisation Stripe...');
        this.initStripe();
    };
    
    // Démarrer la vérification après un court délai
        setTimeout(initStripeWhenReady, 2000);

            
        

            
        }
    });