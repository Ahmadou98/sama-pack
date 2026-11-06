package sn.samapack.app.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class StoreProduct(
    val id: String,
    val name: String,
    val price: Double,
    val description: String? = null,
    @SerialName("image_path") val imagePath: String? = null,
    @SerialName("image_paths") val imagePaths: List<String> = emptyList(),
    @SerialName("catalog_type") val catalogType: String = "product",
    @SerialName("availability_status") val availabilityStatus: String = "available",
    @SerialName("sale_unit") val saleUnit: String = "unit",
    val brand: String? = null,
    @SerialName("public_ref") val publicRef: String? = null,
    @SerialName("promo_active") val promoActive: Boolean = false,
    @SerialName("promo_price") val promoPrice: Double? = null,
    @SerialName("promo_label") val promoLabel: String? = null,
    @SerialName("promo_started_at") val promoStartedAt: String? = null,
    @SerialName("promo_end_at") val promoEndAt: String? = null,
    @SerialName("max_delivery_hours") val maxDeliveryHours: Int? = null
) {
    val effectivePrice: Double
        get() = if (promoActive && promoPrice != null && promoPrice > 0.0 && promoPrice < price) promoPrice else price

    val imageUrl: String?
        get() {
            val candidate = imagePaths.firstOrNull { it.isNotBlank() } ?: imagePath
            if (candidate.isNullOrBlank()) return null
            if (candidate.startsWith("https://") || candidate.startsWith("http://")) return candidate
            return "https://tbxxrnhcfuaeaatlrdtr.supabase.co/storage/v1/object/public/sama-pack-products/${candidate.trimStart('/')}"
        }

    val isAvailable: Boolean
        get() = availabilityStatus != "out_of_stock"
}

@Serializable
data class StoreSettings(
    val company: String? = null,
    val whatsapp: String? = null,
    @SerialName("delivery_fee") val deliveryFee: Double = 1500.0,
    val currency: String = "FCFA"
)

@Serializable
data class CustomerProfile(
    val id: String,
    @SerialName("full_name") val fullName: String? = null,
    val email: String? = null,
    val phone: String? = null,
    @SerialName("delivery_region") val deliveryRegion: String? = null,
    @SerialName("delivery_city") val deliveryCity: String? = null,
    @SerialName("delivery_commune") val deliveryCommune: String? = null,
    @SerialName("delivery_neighborhood") val deliveryNeighborhood: String? = null,
    @SerialName("delivery_address") val deliveryAddress: String? = null
)

@Serializable
data class StoreOrder(
    val id: String,
    @SerialName("created_at") val createdAt: String? = null,
    val status: String = "new",
    val subtotal: Double = 0.0,
    val delivery: Double = 0.0,
    val total: Double = 0.0,
    @SerialName("customer_name") val customerName: String? = null,
    @SerialName("customer_phone") val customerPhone: String? = null,
    @SerialName("delivery_address") val deliveryAddress: String? = null,
    @SerialName("delivery_zone") val deliveryZone: String? = null,
    val slot: String? = null,
    @SerialName("payment_choice") val paymentChoice: String? = null,
    @SerialName("payment_status") val paymentStatus: String? = null,
    @SerialName("amount_paid") val amountPaid: Double = 0.0
)

@Serializable
data class StoreOrderItem(
    val id: String? = null,
    @SerialName("order_id") val orderId: String,
    @SerialName("product_id") val productId: String? = null,
    @SerialName("product_name") val productName: String,
    val quantity: Int,
    @SerialName("unit_price") val unitPrice: Double,
    @SerialName("sale_unit") val saleUnit: String? = null
)

data class CheckoutInput(
    val name: String,
    val phone: String,
    val address: String,
    val zone: String,
    val slot: String
)

data class OrderCreation(
    val orderId: String,
    val paymentUrl: String? = null,
    val alreadyConfirmed: Boolean = false,
    val paymentError: String? = null
)
