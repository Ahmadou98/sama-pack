package sn.samapack.app.data

import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.functions.functions
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.auth.providers.builtin.Email
import io.github.jan.supabase.functions.Functions
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.Headers
import io.ktor.http.HttpHeaders
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

object SupabaseRepository {
    private val client = createSupabaseClient(
        supabaseUrl = "https://tbxxrnhcfuaeaatlrdtr.supabase.co",
        supabaseKey = "sb_publishable_lDAKRHFWyUYZ-tb23hbbnQ_96zF9Iwo"
    ) {
        install(Auth)
        install(Postgrest)
        install(Functions)
    }

    suspend fun initializeAuth() {
        client.auth.awaitInitialization()
    }

    fun currentUserId(): String? = client.auth.currentUserOrNull()?.id

    fun currentEmail(): String? = client.auth.currentUserOrNull()?.email

    suspend fun loadProducts(): List<StoreProduct> =
        client.from("products")
            .select(
                columns = Columns.list(
                    "id, name, price, description, category, items, image_path, image_paths, catalog_type, availability_status, sale_unit, brand, public_ref, promo_active, promo_price, promo_label, promo_started_at, promo_end_at, max_delivery_hours"
                )
            ) {
                filter { eq("active", true) }
                order("name", Order.ASCENDING)
                limit(500)
            }
            .decodeList()

    suspend fun loadSettings(): StoreSettings? =
        client.from("settings")
            .select(columns = Columns.list("company, whatsapp, delivery_fee, currency")) {
                filter { eq("id", true) }
                limit(1)
            }
            .decodeSingleOrNull()

    suspend fun loadProfile(): CustomerProfile? {
        val userId = currentUserId() ?: return null
        return client.from("profiles")
            .select(
                columns = Columns.list(
                    "id, full_name, email, phone, delivery_region, delivery_city, delivery_commune, delivery_neighborhood, delivery_address"
                )
            ) {
                filter { eq("id", userId) }
                limit(1)
            }
            .decodeSingleOrNull()
    }

    suspend fun loadOrders(): List<StoreOrder> {
        val userId = currentUserId() ?: return emptyList()
        return client.from("orders")
            .select(
                columns = Columns.list(
                    "id, created_at, status, subtotal, delivery, total, customer_name, customer_phone, delivery_address, delivery_zone, slot, payment_choice, payment_status, amount_paid"
                )
            ) {
                filter { eq("user_id", userId) }
                order("created_at", Order.DESCENDING)
                limit(30)
            }
            .decodeList()
    }

    suspend fun loadOrderItems(orderId: String): List<StoreOrderItem> =
        client.from("order_items")
            .select(
                columns = Columns.list("id, order_id, product_id, product_name, quantity, unit_price, sale_unit")
            ) {
                filter { eq("order_id", orderId) }
                order("id", Order.ASCENDING)
            }
            .decodeList()

    suspend fun signIn(email: String, password: String) {
        client.auth.signInWith(Email) {
            this.email = email.trim()
            this.password = password
        }
    }

    suspend fun signUp(
        name: String,
        email: String,
        phone: String,
        password: String,
        city: String,
        commune: String,
        neighborhood: String,
        address: String
    ) {
        val normalizedPhone = phone.trim()
        require(normalizedPhone.startsWith("+") && normalizedPhone.count { it.isDigit() } in 8..15) {
            "Indique un numéro WhatsApp international, par exemple +221771234567."
        }
        require(name.trim().length >= 2) { "Indiquez votre nom complet." }
        require(city.isNotBlank() && commune.isNotBlank() && neighborhood.isNotBlank() && address.isNotBlank()) {
            "Complétez votre ville, commune, quartier et adresse de livraison."
        }

        client.auth.signUpWith(Email, redirectUrl = "https://sama-pack.store/") {
            this.email = email.trim()
            this.password = password
            data = buildJsonObject {
                put("account_type", "customer")
                put("full_name", name.trim())
                put("phone", normalizedPhone)
                put("delivery_region", "Dakar")
                put("delivery_city", city.trim())
                put("delivery_commune", commune.trim())
                put("delivery_neighborhood", neighborhood.trim())
                put("delivery_address", address.trim())
            }
        }
    }

    suspend fun signOut() {
        client.auth.signOut()
    }

    suspend fun placeOrder(
        checkout: CheckoutInput,
        quantities: Map<String, Int>,
        paymentChoice: String
    ): OrderCreation {
        check(currentUserId() != null) { "Connectez-vous pour passer commande." }
        require(quantities.isNotEmpty()) { "Votre panier est vide." }

        val payload = buildJsonObject {
            put(
                "customer",
                buildJsonObject {
                    put("name", checkout.name.trim())
                    put("phone", checkout.phone.trim())
                    put("address", checkout.address.trim())
                    put("zone", checkout.zone.trim())
                }
            )
            put("slot", checkout.slot.trim())
            put("payment_choice", paymentChoice)
            put("items", buildJsonArray {
                quantities.forEach { (productId, quantity) ->
                    add(buildJsonObject {
                        put("product_id", productId)
                        put("quantity", quantity)
                    })
                }
            })
        }

        val result = client.postgrest
            .rpc("sama_place_order", buildJsonObject { put("p_payload", payload) })
            .decodeAs<JsonObject>()

        val ok = result["ok"]?.jsonPrimitive?.booleanOrNull == true
        if (!ok) {
            val message = result["error"]?.jsonPrimitive?.contentOrNull
            throw IllegalStateException(message ?: "La commande n'a pas pu être enregistrée.")
        }

        val order = result["order"]?.jsonObject
            ?: throw IllegalStateException("Le serveur n'a pas retourné la référence de commande.")
        val orderId = order["id"]?.jsonPrimitive?.contentOrNull
            ?: throw IllegalStateException("Référence de commande manquante.")

        // The order has been persisted by the database RPC. A temporary PayDunya
        // outage must not cause the customer to submit the same order twice.
        return try {
            createPaymentCheckout(orderId)
        } catch (exception: Exception) {
            OrderCreation(
                orderId = orderId,
                paymentError = exception.message ?: "Le paiement n'a pas pu être initialisé."
            )
        }
    }

    suspend fun retryPayment(orderId: String): OrderCreation = createPaymentCheckout(orderId)

    private suspend fun createPaymentCheckout(orderId: String): OrderCreation {
        val response = client.functions.invoke(
            function = "sama-payment-checkout",
            body = buildJsonObject {
                put("action", "create_checkout")
                put("order_id", orderId)
            },
            headers = Headers.build {
                append(HttpHeaders.ContentType, ContentType.Application.Json.toString())
            }
        )
        val json = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        val alreadyConfirmed = json["already_confirmed"]?.jsonPrimitive?.booleanOrNull == true
        val paymentUrl = json["payment_url"]?.jsonPrimitive?.contentOrNull

        if (!alreadyConfirmed && paymentUrl.isNullOrBlank()) {
            val message = json["error"]?.jsonPrimitive?.contentOrNull
            throw IllegalStateException(message ?: "Le paiement n'a pas pu être initialisé.")
        }

        return OrderCreation(orderId, paymentUrl, alreadyConfirmed)
    }

    suspend fun verifyPayment(orderId: String): String? {
        val response = client.functions.invoke(
            function = "sama-payment-checkout",
            body = buildJsonObject {
                put("action", "verify_return")
                put("order_id", orderId)
            },
            headers = Headers.build {
                append(HttpHeaders.ContentType, ContentType.Application.Json.toString())
            }
        )
        val json = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        return json["message"]?.jsonPrimitive?.contentOrNull
            ?: json["payment_status"]?.jsonPrimitive?.contentOrNull
            ?: json["order_status"]?.jsonPrimitive?.contentOrNull
    }
}
