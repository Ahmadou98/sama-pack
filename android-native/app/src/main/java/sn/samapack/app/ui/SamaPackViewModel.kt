package sn.samapack.app.ui

import android.app.Application
import android.content.Context
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import org.json.JSONObject
import sn.samapack.app.data.CheckoutInput
import sn.samapack.app.data.CustomerProfile
import sn.samapack.app.data.StoreOrder
import sn.samapack.app.data.StoreProduct
import sn.samapack.app.data.StoreSettings
import sn.samapack.app.data.SupabaseRepository

data class SamaPackState(
    val loading: Boolean = true,
    val busy: Boolean = false,
    val products: List<StoreProduct> = emptyList(),
    val settings: StoreSettings = StoreSettings(),
    val profile: CustomerProfile? = null,
    val userId: String? = null,
    val email: String? = null,
    val orders: List<StoreOrder> = emptyList(),
    val cart: Map<String, Int> = emptyMap(),
    val notice: String? = null,
    val error: String? = null,
    val paymentUrl: String? = null,
    val pendingOrderId: String? = null
)

class SamaPackViewModel(application: Application) : AndroidViewModel(application) {
    private val preferences = application.getSharedPreferences("samapack_native_cart", Context.MODE_PRIVATE)
    private val _state = MutableStateFlow(SamaPackState(cart = restoreCart()))
    val state = _state

    init {
        refresh()
    }

    private fun restoreCart(): Map<String, Int> {
        return try {
            val stored = preferences.getString("items", "{}") ?: "{}"
            val json = JSONObject(stored)
            json.keys().asSequence().mapNotNull { key ->
                val quantity = json.optInt(key, 0)
                if (quantity > 0) key to quantity else null
            }.toMap()
        } catch (_: Exception) {
            emptyMap()
        }
    }

    private fun persistCart(cart: Map<String, Int>) {
        val json = JSONObject()
        cart.forEach { (id, quantity) -> json.put(id, quantity) }
        preferences.edit().putString("items", json.toString()).apply()
    }

    private fun update(transform: (SamaPackState) -> SamaPackState) {
        _state.value = transform(_state.value)
    }

    fun refresh() {
        viewModelScope.launch {
            update { it.copy(loading = true, error = null) }
            try {
                SupabaseRepository.initializeAuth()
                val products = SupabaseRepository.loadProducts()
                val settings = runCatching { SupabaseRepository.loadSettings() }.getOrNull()
                    ?: StoreSettings()
                val userId = SupabaseRepository.currentUserId()
                val email = SupabaseRepository.currentEmail()
                val profile = if (userId != null) runCatching { SupabaseRepository.loadProfile() }.getOrNull() else null
                val orders = if (userId != null) runCatching { SupabaseRepository.loadOrders() }.getOrDefault(emptyList()) else emptyList()
                update {
                    it.copy(
                        loading = false,
                        products = products,
                        settings = settings,
                        userId = userId,
                        email = email,
                        profile = profile,
                        orders = orders,
                        error = null
                    )
                }
            } catch (exception: Exception) {
                update {
                    it.copy(
                        loading = false,
                        error = exception.message ?: "Connexion impossible. Vérifiez votre connexion Internet."
                    )
                }
            }
        }
    }

    fun addToCart(product: StoreProduct) {
        if (!product.isAvailable) {
            update { it.copy(notice = "Cet article est actuellement indisponible.") }
            return
        }
        val next = _state.value.cart.toMutableMap()
        val current = next[product.id] ?: 0
        if (current >= 99) return
        next[product.id] = current + 1
        persistCart(next)
        update { it.copy(cart = next, notice = "${product.name} ajouté au panier.", error = null) }
    }

    fun addBatchToCart(selection: Map<String, Int>) {
        val current = _state.value
        val productsById = current.products.associateBy { it.id }
        val next = current.cart.toMutableMap()
        var accepted = 0
        var skipped = 0

        selection.forEach { (productId, requestedQuantity) ->
            val product = productsById[productId]
            val quantity = requestedQuantity.coerceIn(0, 99)
            if (product == null || !product.isAvailable || product.effectivePrice <= 0.0 || quantity == 0) {
                skipped += 1
            } else {
                val existing = next[productId] ?: 0
                val updated = (existing + quantity).coerceAtMost(99)
                if (updated > existing) {
                    next[productId] = updated
                    accepted += updated - existing
                }
            }
        }

        if (accepted == 0) {
            update { it.copy(notice = "Aucun article disponible n’a pu être ajouté au panier.", error = null) }
            return
        }

        persistCart(next)
        update {
            it.copy(
                cart = next,
                notice = if (skipped > 0) {
                    "$accepted article(s) ajouté(s). Certains articles indisponibles ont été ignorés."
                } else {
                    "$accepted article(s) ajouté(s) au panier."
                },
                error = null
            )
        }
    }

    fun setQuantity(productId: String, quantity: Int) {
        val next = _state.value.cart.toMutableMap()
        if (quantity <= 0) next.remove(productId) else next[productId] = quantity.coerceAtMost(99)
        persistCart(next)
        update { it.copy(cart = next) }
    }

    fun clearCart() {
        persistCart(emptyMap())
        update { it.copy(cart = emptyMap()) }
    }

    fun signIn(email: String, password: String) {
        viewModelScope.launch {
            update { it.copy(busy = true, error = null, notice = null) }
            try {
                SupabaseRepository.signIn(email, password)
                val profile = SupabaseRepository.loadProfile()
                val orders = SupabaseRepository.loadOrders()
                update {
                    it.copy(
                        busy = false,
                        userId = SupabaseRepository.currentUserId(),
                        email = SupabaseRepository.currentEmail(),
                        profile = profile,
                        orders = orders,
                        notice = "Connexion réussie."
                    )
                }
            } catch (exception: Exception) {
                update { it.copy(busy = false, error = exception.message ?: "Connexion impossible.") }
            }
        }
    }

    fun signUp(
        name: String,
        email: String,
        phone: String,
        password: String,
        city: String,
        commune: String,
        neighborhood: String,
        address: String
    ) {
        viewModelScope.launch {
            update { it.copy(busy = true, error = null, notice = null) }
            try {
                SupabaseRepository.signUp(name, email, phone, password, city, commune, neighborhood, address)
                val userId = SupabaseRepository.currentUserId()
                val profile = if (userId != null) SupabaseRepository.loadProfile() else null
                update {
                    it.copy(
                        busy = false,
                        userId = userId,
                        email = SupabaseRepository.currentEmail() ?: email,
                        profile = profile,
                        notice = if (userId != null) "Votre compte est prêt. Bienvenue chez SAMA-PACK !" else "Compte créé. Vérifiez votre boîte e-mail pour confirmer votre adresse, puis connectez-vous."
                    )
                }
            } catch (exception: Exception) {
                update { it.copy(busy = false, error = exception.message ?: "Création du compte impossible.") }
            }
        }
    }

    fun signOut() {
        viewModelScope.launch {
            update { it.copy(busy = true, error = null) }
            try {
                SupabaseRepository.signOut()
                update {
                    it.copy(
                        busy = false,
                        userId = null,
                        email = null,
                        profile = null,
                        orders = emptyList(),
                        notice = "Vous êtes déconnecté."
                    )
                }
            } catch (exception: Exception) {
                update { it.copy(busy = false, error = exception.message ?: "Déconnexion impossible.") }
            }
        }
    }

    fun checkout(input: CheckoutInput, payChoice: String) {
        val current = _state.value
        if (current.userId == null) {
            update { it.copy(error = "Connectez-vous avant de confirmer votre commande.") }
            return
        }
        if (current.cart.isEmpty()) {
            update { it.copy(error = "Votre panier est vide.") }
            return
        }
        viewModelScope.launch {
            update { it.copy(busy = true, error = null, notice = null, paymentUrl = null) }
            try {
                val result = SupabaseRepository.placeOrder(input, current.cart, payChoice)
                persistCart(emptyMap())
                update {
                    it.copy(
                        busy = false,
                        cart = emptyMap(),
                        pendingOrderId = result.orderId,
                        paymentUrl = result.paymentUrl,
                        notice = when {
                            result.alreadyConfirmed -> "Commande ${result.orderId} déjà confirmée."
                            result.paymentError != null -> "Commande ${result.orderId} enregistrée. Le paiement n'a pas démarré : ${result.paymentError}. Reprenez-le depuis Mes commandes."
                            else -> "Commande ${result.orderId} enregistrée. Le paiement sécurisé va s'ouvrir."
                        }
                    )
                }
                runCatching { refreshOrdersOnly() }
            } catch (exception: Exception) {
                update { it.copy(busy = false, error = exception.message ?: "La commande n'a pas pu être finalisée.") }
            }
        }
    }

    fun retryPayment(orderId: String) {
        viewModelScope.launch {
            update { it.copy(busy = true, error = null, paymentUrl = null) }
            try {
                val result = SupabaseRepository.retryPayment(orderId)
                update {
                    it.copy(
                        busy = false,
                        pendingOrderId = orderId,
                        paymentUrl = result.paymentUrl,
                        notice = if (result.alreadyConfirmed) "Ce paiement est déjà confirmé." else "Reprise du paiement sécurisé."
                    )
                }
            } catch (exception: Exception) {
                update { it.copy(busy = false, error = exception.message ?: "Impossible de reprendre le paiement.") }
            }
        }
    }

    fun verifyPayment(orderId: String) {
        viewModelScope.launch {
            update { it.copy(busy = true, error = null) }
            try {
                val message = SupabaseRepository.verifyPayment(orderId)
                runCatching { refreshOrdersOnly() }
                update {
                    it.copy(
                        busy = false,
                        notice = message ?: "Vérification terminée. Le statut de votre commande a été actualisé."
                    )
                }
            } catch (exception: Exception) {
                update { it.copy(busy = false, error = exception.message ?: "La vérification du paiement a échoué.") }
            }
        }
    }

    fun consumePaymentUrl() {
        update { it.copy(paymentUrl = null) }
    }

    fun consumeNotice() {
        update { it.copy(notice = null, error = null) }
    }

    private suspend fun refreshOrdersOnly() {
        val userId = SupabaseRepository.currentUserId() ?: return
        val orders = SupabaseRepository.loadOrders()
        update { it.copy(userId = userId, orders = orders) }
    }

    fun cartSubtotal(): Double {
        val products = _state.value.products.associateBy { it.id }
        return _state.value.cart.entries.sumOf { (id, quantity) ->
            (products[id]?.effectivePrice ?: 0.0) * quantity
        }
    }

    fun productCount(): Int = _state.value.cart.values.sum()
}
