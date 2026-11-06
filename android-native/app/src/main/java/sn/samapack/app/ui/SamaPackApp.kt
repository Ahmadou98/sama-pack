package sn.samapack.app.ui

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowForward
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.LocalOffer
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.ReceiptLong
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.ShoppingBag
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Divider
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import sn.samapack.app.data.CheckoutInput
import sn.samapack.app.data.CustomerProfile
import sn.samapack.app.data.StoreOrder
import sn.samapack.app.data.StoreProduct
import java.text.NumberFormat
import java.util.Locale
import kotlin.math.roundToLong
import kotlinx.coroutines.launch

private val BrandGreen = Color(0xFF176B43)
private val BrandGreenDark = Color(0xFF125936)
private val BrandAccent = Color(0xFF28A765)
private val FooterGreen = Color(0xFF10271B)
private val AppBackground = Color(0xFFF5F8F5)
private val Ink = Color(0xFF15251C)
private val Muted = Color(0xFF68786E)
private val Border = Color(0xFFE4EBE5)
private val SoftGreen = Color(0xFFE1F7E7)
private val Warm = Color(0xFFF0FAF2)

private enum class AppTab(val label: String) {
    HOME("Accueil"),
    PACKS("Packs de nettoyage"),
    PRODUCTS("Produits à l’unité ou par colis"),
    TOOLS("Outils de nettoyage"),
    CART("Panier"),
    ORDERS("Mes commandes"),
    ACCOUNT("Compte"),
    HOW("Comment ça marche"),
    B2B("Professionnels"),
    CONTACT("Contact")
}

@Composable
private fun SiteBrandMark() {
    Box(
        Modifier
            .size(36.dp)
            .clip(RoundedCornerShape(11.dp))
            .background(Brush.linearGradient(listOf(BrandGreen, BrandAccent))),
        contentAlignment = Alignment.Center
    ) {
        Text("S", color = Color.White, fontWeight = FontWeight.Black, fontSize = 21.sp)
    }
}

@Composable
private fun SiteHeader(
    signedIn: Boolean,
    cartCount: Int,
    onNavigate: (AppTab) -> Unit
) {
    var menuExpanded by remember { mutableStateOf(false) }
    Box(
        Modifier
            .fillMaxWidth()
            .background(Color.White)
            .padding(horizontal = 12.dp, vertical = 8.dp)
    ) {
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(17.dp),
            color = Color.White,
            shadowElevation = 5.dp
        ) {
            Row(
                Modifier.fillMaxWidth().height(62.dp).padding(horizontal = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                SiteBrandMark()
                Spacer(Modifier.width(8.dp))
                Text(
                    "SAMA-PACK",
                    color = Ink,
                    fontWeight = FontWeight.Black,
                    fontSize = 17.sp,
                    letterSpacing = (-0.7).sp
                )
                Spacer(Modifier.weight(1f))
                Box(contentAlignment = Alignment.TopEnd) {
                    IconButton(
                        onClick = { onNavigate(AppTab.CART) },
                        modifier = Modifier.size(40.dp)
                    ) {
                        Icon(Icons.Default.ShoppingCart, contentDescription = "Panier", tint = BrandGreen)
                    }
                    if (cartCount > 0) {
                        Box(
                            Modifier
                                .padding(top = 2.dp, end = 1.dp)
                                .size(17.dp)
                                .clip(CircleShape)
                                .background(Color(0xFFE98B2A)),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(cartCount.coerceAtMost(99).toString(), color = Color.White, fontSize = 9.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
                TextButton(
                    onClick = { onNavigate(AppTab.ACCOUNT) },
                    contentPadding = PaddingValues(horizontal = 6.dp, vertical = 4.dp)
                ) {
                    Text(
                        if (signedIn) "Compte" else "Connexion",
                        color = BrandGreen,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1
                    )
                }
                Box {
                    IconButton(
                        onClick = { menuExpanded = true },
                        modifier = Modifier
                            .size(39.dp)
                            .clip(RoundedCornerShape(10.dp))
                            .background(Color(0xFFF7FBF8))
                    ) {
                        Icon(Icons.Default.Menu, contentDescription = "Ouvrir le menu", tint = Color(0xFF17452D))
                    }
                    DropdownMenu(
                        expanded = menuExpanded,
                        onDismissRequest = { menuExpanded = false },
                        modifier = Modifier.width(270.dp).background(Color.White)
                    ) {
                        val entries = listOf(
                            "Accueil" to AppTab.HOME,
                            "Packs de nettoyage" to AppTab.PACKS,
                            "Produits à l’unité ou par colis" to AppTab.PRODUCTS,
                            "Outils de nettoyage" to AppTab.TOOLS,
                            "Comment ça marche" to AppTab.HOW,
                            "Professionnels" to AppTab.B2B,
                            "Contact" to AppTab.CONTACT,
                            "Mes commandes" to AppTab.ORDERS,
                            "Mon compte" to AppTab.ACCOUNT
                        )
                        entries.forEach { entry ->
                            DropdownMenuItem(
                                text = {
                                    Text(
                                        entry.first,
                                        color = Ink,
                                        fontWeight = if (entry.second == AppTab.HOME) FontWeight.Bold else FontWeight.Medium,
                                        fontSize = 14.sp
                                    )
                                },
                                onClick = {
                                    menuExpanded = false
                                    onNavigate(entry.second)
                                }
                            )
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SamaPackApp(viewModel: SamaPackViewModel) {
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current
    var currentTab by rememberSaveable { mutableStateOf(AppTab.HOME) }
    var selectedProduct by remember { mutableStateOf<StoreProduct?>(null) }
    var checkoutOpen by rememberSaveable { mutableStateOf(false) }
    var budgetBuilderOpen by rememberSaveable { mutableStateOf(false) }
    val snackbar = remember { SnackbarHostState() }
    val coroutineScope = rememberCoroutineScope()

    val navigate: (AppTab) -> Unit = { destination -> currentTab = destination }

    fun openWhatsApp(message: String) {
        val digits = state.settings.whatsapp.filter { it.isDigit() }.ifBlank { "221771018290" }
        val uri = Uri.parse("https://wa.me/" + digits + "?text=" + Uri.encode(message))
        runCatching {
            context.startActivity(Intent(Intent.ACTION_VIEW, uri))
        }.onFailure {
            coroutineScope.launch { snackbar.showSnackbar("Impossible d’ouvrir WhatsApp sur cet appareil.") }
        }
    }

    fun shareProduct(product: StoreProduct) {
        val url = "https://sama-pack.store/fiche-produit.html?ref=" + Uri.encode(product.id)
        val shareIntent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, product.name + " — SAMA-PACK")
            putExtra(Intent.EXTRA_TEXT, product.name + " est disponible chez SAMA-PACK : " + url)
        }
        runCatching {
            context.startActivity(Intent.createChooser(shareIntent, "Partager ce produit"))
        }.onFailure {
            coroutineScope.launch { snackbar.showSnackbar("Le partage n’a pas pu être ouvert.") }
        }
    }

    LaunchedEffect(state.paymentUrl) {
        val url = state.paymentUrl ?: return@LaunchedEffect
        val uri = runCatching { Uri.parse(url) }.getOrNull()
        val host = uri?.host.orEmpty().lowercase(Locale.ROOT)
        val validPaymentHost = host == "paydunya.com" || host.endsWith(".paydunya.com")
        if (uri != null && uri.scheme == "https" && validPaymentHost) {
            runCatching {
                context.startActivity(Intent(Intent.ACTION_VIEW, uri))
            }.onFailure {
                snackbar.showSnackbar("Impossible d'ouvrir la page sécurisée de paiement.")
            }
        } else {
            snackbar.showSnackbar("Lien de paiement refusé : domaine non reconnu.")
        }
        viewModel.consumePaymentUrl()
    }

    LaunchedEffect(state.notice) {
        state.notice?.let {
            snackbar.showSnackbar(it)
            viewModel.consumeNotice()
        }
    }
    LaunchedEffect(state.error) {
        state.error?.let {
            snackbar.showSnackbar(it)
            viewModel.consumeNotice()
        }
    }

    BackHandler(enabled = selectedProduct != null || checkoutOpen || budgetBuilderOpen || currentTab != AppTab.HOME) {
        when {
            checkoutOpen -> checkoutOpen = false
            budgetBuilderOpen -> budgetBuilderOpen = false
            selectedProduct != null -> selectedProduct = null
            else -> currentTab = AppTab.HOME
        }
    }

    MaterialTheme(
        colorScheme = MaterialTheme.colorScheme.copy(
            primary = BrandGreen,
            onPrimary = Color.White,
            background = AppBackground,
            surface = Color.White,
            onSurface = Ink
        )
    ) {
        Scaffold(
            modifier = Modifier.fillMaxSize(),
            containerColor = AppBackground,
            snackbarHost = { SnackbarHost(hostState = snackbar) },
            topBar = {
                SiteHeader(
                    signedIn = state.userId != null,
                    cartCount = viewModel.productCount(),
                    onNavigate = navigate
                )
            }
        ) { padding ->
            Box(Modifier.fillMaxSize().padding(padding)) {
                when (currentTab) {
                    AppTab.HOME -> HomeScreen(
                        products = state.products,
                        loading = state.loading,
                        deliveryFee = state.settings.deliveryFee,
                        onOpenTab = navigate,
                        onOpenProduct = { selectedProduct = it },
                        onAdd = viewModel::addToCart,
                        onShare = ::shareProduct,
                        onComposePack = { budgetBuilderOpen = true },
                        onContact = { openWhatsApp("Bonjour SAMA-PACK, je souhaite obtenir des informations.") }
                    )
                    AppTab.PACKS -> CatalogScreen(
                        products = state.products,
                        catalogType = "pack",
                        loading = state.loading,
                        onOpenProduct = { selectedProduct = it },
                        onAdd = viewModel::addToCart,
                        onShare = ::shareProduct,
                        onComposePack = { budgetBuilderOpen = true },
                        onOpenTab = navigate
                    )
                    AppTab.PRODUCTS -> CatalogScreen(
                        products = state.products,
                        catalogType = "product",
                        loading = state.loading,
                        onOpenProduct = { selectedProduct = it },
                        onAdd = viewModel::addToCart,
                        onShare = ::shareProduct,
                        onComposePack = { budgetBuilderOpen = true },
                        onOpenTab = navigate
                    )
                    AppTab.TOOLS -> CatalogScreen(
                        products = state.products,
                        catalogType = "tool",
                        loading = state.loading,
                        onOpenProduct = { selectedProduct = it },
                        onAdd = viewModel::addToCart,
                        onShare = ::shareProduct,
                        onComposePack = { budgetBuilderOpen = true },
                        onOpenTab = navigate
                    )
                    AppTab.CART -> CartScreen(
                        state = state,
                        viewModel = viewModel,
                        onCheckout = {
                            if (state.userId == null) currentTab = AppTab.ACCOUNT
                            else checkoutOpen = true
                        },
                        onContinueShopping = { currentTab = AppTab.PACKS }
                    )
                    AppTab.ORDERS -> OrdersScreen(
                        state = state,
                        viewModel = viewModel,
                        onSignIn = { currentTab = AppTab.ACCOUNT }
                    )
                    AppTab.ACCOUNT -> AccountScreen(state, viewModel)
                    AppTab.HOW -> HowScreen(onOpenTab = navigate)
                    AppTab.B2B -> ProfessionalsScreen(onContact = { openWhatsApp("Bonjour SAMA-PACK, je souhaite demander un devis professionnel.") })
                    AppTab.CONTACT -> ContactScreen(
                        phone = state.settings.whatsapp,
                        onWhatsApp = { openWhatsApp("Bonjour SAMA-PACK, j’ai une question concernant vos produits.") }
                    )
                }

                if (state.loading && state.products.isEmpty()) {
                    Box(
                        modifier = Modifier.fillMaxSize().background(AppBackground.copy(alpha = 0.78f)),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            CircularProgressIndicator(color = BrandGreen)
                            Spacer(Modifier.height(12.dp))
                            Text("Chargement du catalogue…", color = Muted)
                        }
                    }
                }
            }
        }
    }

    selectedProduct?.let { product ->
        ProductDetailsSheet(
            product = product,
            onDismiss = { selectedProduct = null },
            onAdd = {
                viewModel.addToCart(product)
                selectedProduct = null
            }
        )
    }

    if (budgetBuilderOpen) {
        BudgetBuilderSheet(
            products = state.products,
            onDismiss = { budgetBuilderOpen = false },
            onAdd = { selection ->
                viewModel.addBatchToCart(selection)
                budgetBuilderOpen = false
            }
        )
    }

    if (checkoutOpen) {
        CheckoutSheet(
            profile = state.profile,
            deliveryFee = state.settings.deliveryFee,
            subtotal = viewModel.cartSubtotal(),
            busy = state.busy,
            onDismiss = { checkoutOpen = false },
            onConfirm = { input, paymentChoice ->
                checkoutOpen = false
                viewModel.checkout(input, paymentChoice)
            }
        )
    }
}


@Composable
@Composable
private fun HomeScreen(
    products: List<StoreProduct>,
    loading: Boolean,
    deliveryFee: Double,
    onOpenTab: (AppTab) -> Unit,
    onOpenProduct: (StoreProduct) -> Unit,
    onAdd: (StoreProduct) -> Unit,
    onShare: (StoreProduct) -> Unit,
    onComposePack: () -> Unit,
    onContact: () -> Unit
) {
    val packs = products.filter { it.catalogType == "pack" }
    val promos = packs.filter {
        it.promoActive && it.isAvailable && it.price > 0.0 && it.promoPrice != null && it.promoPrice < it.price
    }
    var promoIndex by rememberSaveable { mutableStateOf(0) }
    var search by rememberSaveable { mutableStateOf("") }
    var category by rememberSaveable { mutableStateOf("all") }
    val categories = packs.mapNotNull { it.category?.trim()?.takeIf(String::isNotBlank) }
        .distinct().sortedBy { it.lowercase(Locale.ROOT) }
    val filteredPacks = packs.filter { product ->
        val query = search.trim()
        val matchesSearch = query.isBlank() ||
            product.name.contains(query, ignoreCase = true) ||
            product.category.orEmpty().contains(query, ignoreCase = true) ||
            product.description.orEmpty().contains(query, ignoreCase = true) ||
            product.items.any { it.contains(query, ignoreCase = true) }
        val matchesCategory = category == "all" || product.category.equals(category, ignoreCase = true)
        matchesSearch && matchesCategory
    }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(0.dp)
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .background(
                    Brush.linearGradient(
                        listOf(Color(0xFFF5FAF6), Color.White, Color(0xFFEDF8EF))
                    )
                )
                .padding(horizontal = 18.dp, vertical = 34.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(
                "DISTRIBUTION SIMPLE • DAKAR",
                color = BrandGreen,
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Black,
                letterSpacing = 1.7.sp
            )
            Text(
                "Packs de nettoyage et produits d’entretien à",
                color = Ink,
                fontSize = 34.sp,
                lineHeight = 38.sp,
                letterSpacing = (-1.5).sp,
                fontWeight = FontWeight.Black
            )
            Text(
                "Dakar.",
                color = BrandGreen,
                fontSize = 38.sp,
                lineHeight = 40.sp,
                letterSpacing = (-1.7).sp,
                fontWeight = FontWeight.Black
            )
            Text(
                "Des produits d’entretien et d’hygiène pour les familles et les professionnels, disponibles en packs, à l’unité ou par colis, avec livraison à Dakar.",
                color = Color(0xFF53645A),
                fontSize = 14.sp,
                lineHeight = 22.sp
            )
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(9.dp)
            ) {
                Button(
                    onClick = { onOpenTab(AppTab.PACKS) },
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(13.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = BrandGreen)
                ) {
                    Text("Voir les packs", fontWeight = FontWeight.Bold, fontSize = 12.sp, maxLines = 1)
                }
                OutlinedButton(
                    onClick = { onOpenTab(AppTab.PACKS) },
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(13.dp),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = BrandGreen)
                ) {
                    Text("Commander en ligne", fontWeight = FontWeight.Bold, fontSize = 11.sp, maxLines = 1)
                }
            }
            Row(
                Modifier.fillMaxWidth().padding(top = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                TrustPoint(
                    icon = Icons.Default.Inventory2,
                    headline = packs.size.toString(),
                    detail = "packs au catalogue",
                    modifier = Modifier.weight(1f)
                )
                TrustPoint(
                    icon = Icons.Default.ShoppingBag,
                    headline = "Simple",
                    detail = "commande en ligne",
                    modifier = Modifier.weight(1f)
                )
                TrustPoint(
                    icon = Icons.Default.CheckCircle,
                    headline = "24/7",
                    detail = "catalogue en ligne",
                    modifier = Modifier.weight(1f)
                )
            }
            Spacer(Modifier.height(10.dp))
            FlashPromoPanel(
                promos = promos,
                selectedIndex = if (promos.isEmpty()) 0 else promoIndex % promos.size,
                onPrevious = { if (promos.size > 1) promoIndex = (promoIndex - 1 + promos.size) % promos.size },
                onNext = { if (promos.size > 1) promoIndex = (promoIndex + 1) % promos.size },
                onOpen = { product -> onOpenProduct(product) },
                onAdd = onAdd
            )
        }

        Column(
            Modifier.fillMaxWidth().background(Color.White).padding(horizontal = 18.dp, vertical = 34.dp),
            verticalArrangement = Arrangement.spacedBy(15.dp)
        ) {
            Eyebrow("CATALOGUE")
            Text(
                "Choisis ton pack",
                color = Ink,
                fontSize = 29.sp,
                lineHeight = 34.sp,
                letterSpacing = (-0.9).sp,
                fontWeight = FontWeight.Black
            )
            OutlinedTextField(
                value = search,
                onValueChange = { search = it },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                placeholder = { Text("Rechercher un pack…", fontSize = 13.sp) },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null, tint = Muted) },
                shape = RoundedCornerShape(12.dp)
            )
            CategorySelector(
                categories = categories,
                selected = category,
                onSelect = { category = it }
            )
            BudgetBuilderBanner(onClick = onComposePack)
            if (loading && packs.isEmpty()) {
                LoadingInline()
            } else if (filteredPacks.isEmpty()) {
                EmptyState(
                    if (packs.isEmpty()) "Nos packs arrivent bientôt" else "Aucun pack trouvé",
                    if (packs.isEmpty()) "Le catalogue sera actualisé dès que les références seront publiées." else "Modifie la recherche ou choisis une autre catégorie."
                )
            } else {
                Text(
                    filteredPacks.size.toString() + " pack(s)",
                    color = Muted,
                    style = MaterialTheme.typography.labelMedium
                )
                ProductGrid(
                    products = filteredPacks.take(20),
                    onOpen = onOpenProduct,
                    onAdd = onAdd,
                    onShare = onShare
                )
                if (filteredPacks.size > 20) {
                    Text(
                        "Retrouve les autres références dans le catalogue complet.",
                        color = Muted,
                        fontSize = 11.sp
                    )
                }
            }
            OutlinedButton(
                onClick = { onOpenTab(AppTab.PACKS) },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp)
            ) {
                Text("Voir tous les packs")
                Spacer(Modifier.width(7.dp))
                Icon(Icons.Default.ArrowForward, contentDescription = null, modifier = Modifier.size(17.dp))
            }
        }

        Column(
            Modifier.fillMaxWidth().background(AppBackground).padding(horizontal = 18.dp, vertical = 30.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Eyebrow("PARCOURS CLIENT")
            Text(
                "Commander en toute simplicité.",
                color = Ink,
                fontSize = 26.sp,
                lineHeight = 31.sp,
                fontWeight = FontWeight.Black
            )
            Text(
                "Découvrez comment choisir vos articles, confirmer votre commande, effectuer le paiement et suivre son avancement depuis votre compte.",
                color = Muted,
                fontSize = 13.sp,
                lineHeight = 20.sp
            )
            Button(
                onClick = { onOpenTab(AppTab.HOW) },
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = BrandGreen)
            ) {
                Text("Voir le guide client")
                Spacer(Modifier.width(8.dp))
                Icon(Icons.Default.ArrowForward, contentDescription = null, modifier = Modifier.size(17.dp))
            }
        }

        Column(
            Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 28.dp),
            verticalArrangement = Arrangement.spacedBy(13.dp)
        ) {
            Eyebrow("B2B")
            Text(
                "Approvisionnez votre structure sans perdre du temps.",
                color = Ink,
                fontSize = 27.sp,
                lineHeight = 32.sp,
                fontWeight = FontWeight.Black
            )
            Text(
                "Bureaux, boutiques, écoles, restaurants et événements : créez une commande récurrente ou demandez un devis.",
                color = Muted,
                fontSize = 13.sp,
                lineHeight = 20.sp
            )
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = { onOpenTab(AppTab.B2B) },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = BrandGreen)
                ) { Text("Demander un devis") }
                OutlinedButton(
                    onClick = { onOpenTab(AppTab.B2B) },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp)
                ) { Text("Espace professionnel") }
                TextButton(onClick = onContact, modifier = Modifier.fillMaxWidth()) {
                    Text("Parler à SAMA-PACK", color = BrandGreen, fontWeight = FontWeight.Bold)
                }
            }
        }

        Column(
            Modifier.fillMaxWidth().background(AppBackground).padding(horizontal = 18.dp, vertical = 28.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Eyebrow("CONTACT")
            Text(
                "Une question avant de commander ?",
                color = Ink,
                fontSize = 26.sp,
                lineHeight = 31.sp,
                fontWeight = FontWeight.Black
            )
            Text("Écris-nous sur WhatsApp.", color = Muted, fontSize = 14.sp)
            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                border = androidx.compose.foundation.BorderStroke(1.dp, Border)
            ) {
                Row(
                    Modifier.fillMaxWidth().padding(15.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        Modifier.size(45.dp).clip(RoundedCornerShape(13.dp)).background(SoftGreen),
                        contentAlignment = Alignment.Center
                    ) {
                        Text("💬", fontSize = 22.sp)
                    }
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text("WhatsApp", color = Ink, fontWeight = FontWeight.Bold)
                        Text("Contact commercial", color = Muted, fontSize = 11.sp)
                    }
                    IconButton(onClick = onContact) {
                        Icon(Icons.Default.ArrowForward, contentDescription = "Ouvrir WhatsApp", tint = BrandGreen)
                    }
                }
            }
            Button(
                onClick = onContact,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = BrandGreen)
            ) { Text("Ouvrir WhatsApp") }
        }
        SiteFooter(onOpenTab = onOpenTab)
    }
}

@Composable
private fun TrustPoint(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    headline: String,
    detail: String,
    modifier: Modifier = Modifier
) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Icon(icon, contentDescription = null, tint = BrandGreen, modifier = Modifier.size(20.dp))
        Text(headline, color = Ink, fontSize = 18.sp, fontWeight = FontWeight.Black, maxLines = 1)
        Text(detail, color = Muted, fontSize = 9.sp, lineHeight = 12.sp, maxLines = 2)
    }
}

@Composable
private fun Eyebrow(text: String) {
    Text(
        text.uppercase(Locale.ROOT),
        color = BrandGreen,
        fontSize = 10.sp,
        fontWeight = FontWeight.Black,
        letterSpacing = 1.4.sp
    )
}

@Composable
private fun FlashPromoPanel(
    promos: List<StoreProduct>,
    selectedIndex: Int,
    onPrevious: () -> Unit,
    onNext: () -> Unit,
    onOpen: (StoreProduct) -> Unit,
    onAdd: (StoreProduct) -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Eyebrow("OFFRES À DURÉE LIMITÉE")
                Text(
                    "Vente flash",
                    color = Ink,
                    fontSize = 28.sp,
                    lineHeight = 32.sp,
                    fontWeight = FontWeight.Black,
                    letterSpacing = (-0.8).sp
                )
                Text("Les offres du moment, à ne pas laisser passer.", color = Muted, fontSize = 11.sp)
            }
            if (promos.size > 1) {
                Row {
                    IconButton(onClick = onPrevious, modifier = Modifier.size(36.dp)) {
                        Icon(Icons.Default.ChevronRight, contentDescription = "Vente flash précédente", tint = BrandGreen)
                    }
                    IconButton(onClick = onNext, modifier = Modifier.size(36.dp)) {
                        Icon(Icons.Default.ArrowForward, contentDescription = "Vente flash suivante", tint = BrandGreen)
                    }
                }
            }
        }
        val product = promos.getOrNull(selectedIndex)
        if (product == null) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(17.dp),
                border = androidx.compose.foundation.BorderStroke(1.dp, Border),
                colors = CardDefaults.cardColors(containerColor = Color.White)
            ) {
                Row(
                    Modifier.fillMaxWidth().padding(17.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        Modifier.size(48.dp).clip(RoundedCornerShape(14.dp)).background(SoftGreen),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(Icons.Default.LocalOffer, contentDescription = null, tint = BrandGreen, modifier = Modifier.size(24.dp))
                    }
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("Aucune vente flash pour le moment", color = Ink, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                        Text("De nouvelles offres seront affichées ici. En attendant, découvre tous nos packs.", color = Muted, fontSize = 11.sp, lineHeight = 16.sp)
                    }
                }
            }
            return
        }

        val discount = if (product.price > 0.0) ((1.0 - product.effectivePrice / product.price) * 100).roundToLong() else 0L
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(17.dp),
            border = androidx.compose.foundation.BorderStroke(1.dp, Border),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
        ) {
            Column {
                Box(
                    Modifier.fillMaxWidth().height(184.dp).background(Color(0xFFF7FAF7)),
                    contentAlignment = Alignment.Center
                ) {
                    if (!product.imageUrl.isNullOrBlank()) {
                        AsyncImage(
                            model = product.imageUrl,
                            contentDescription = product.name,
                            modifier = Modifier.fillMaxSize().padding(10.dp),
                            contentScale = ContentScale.Fit
                        )
                    } else {
                        Icon(Icons.Default.Inventory2, contentDescription = null, tint = BrandGreen, modifier = Modifier.size(60.dp))
                    }
                    Surface(
                        Modifier.align(Alignment.TopStart).padding(11.dp),
                        color = Color(0xFF176B43),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text("⚡ VENTE FLASH", color = Color.White, fontSize = 9.sp, fontWeight = FontWeight.Black, modifier = Modifier.padding(horizontal = 9.dp, vertical = 6.dp))
                    }
                }
                Column(
                    Modifier.fillMaxWidth().padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            product.promoLabel?.takeIf(String::isNotBlank) ?: "Prix spécial",
                            color = BrandGreen,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.weight(1f)
                        )
                        if (discount > 0) {
                            Surface(color = Color(0xFFFCE9D5), shape = RoundedCornerShape(8.dp)) {
                                Text("−" + discount + "%", color = Color(0xFF9A4D12), modifier = Modifier.padding(horizontal = 8.dp, vertical = 5.dp), fontSize = 11.sp, fontWeight = FontWeight.Black)
                            }
                        }
                    }
                    Text(product.name, color = Ink, fontSize = 21.sp, lineHeight = 25.sp, fontWeight = FontWeight.Black)
                    product.description?.takeIf(String::isNotBlank)?.let {
                        Text(it.take(145), color = Muted, fontSize = 12.sp, lineHeight = 17.sp, maxLines = 3, overflow = TextOverflow.Ellipsis)
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(formatMoney(product.effectivePrice), color = BrandGreen, fontSize = 23.sp, fontWeight = FontWeight.Black)
                        Spacer(Modifier.width(9.dp))
                        Text(formatMoney(product.price), color = Muted, fontSize = 12.sp, textDecoration = TextDecoration.LineThrough)
                    }
                    Surface(color = Color(0xFFF1F7F2), shape = RoundedCornerShape(10.dp)) {
                        Row(Modifier.fillMaxWidth().padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.LocalOffer, contentDescription = null, tint = BrandGreen, modifier = Modifier.size(17.dp))
                            Spacer(Modifier.width(7.dp))
                            Text("OFFRE EN COURS — Prix spécial disponible", color = BrandGreen, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(
                            onClick = { onOpen(product) },
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(11.dp)
                        ) { Text("Voir le pack", fontSize = 11.sp, maxLines = 1) }
                        Button(
                            onClick = { onAdd(product) },
                            modifier = Modifier.weight(1.25f),
                            shape = RoundedCornerShape(11.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = BrandGreen)
                        ) {
                            Text("Ajouter au panier", fontSize = 11.sp, maxLines = 1)
                        }
                    }
                }
            }
        }
        if (promos.size > 1) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically
            ) {
                promos.indices.forEach { index ->
                    Box(
                        Modifier
                            .padding(horizontal = 3.dp)
                            .width(if (index == selectedIndex) 22.dp else 8.dp).height(8.dp)
                            .clip(CircleShape)
                            .background(if (index == selectedIndex) BrandGreen else Color(0xFFBBF7D0))
                    )
                }
            }
        }
    }
}

@Composable
private fun BudgetBuilderBanner(onClick: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFD7E9DC)),
        colors = CardDefaults.cardColors(containerColor = Color(0xFFF7FCF8))
    ) {
        Row(
            Modifier.fillMaxWidth().padding(15.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Eyebrow("⚡ TON BUDGET, TON CHOIX")
                Text("Compose ton pack personnalisé", color = Ink, fontSize = 17.sp, lineHeight = 21.sp, fontWeight = FontWeight.Black)
                Text("Choisis tes essentiels et compose un pack adapté à ton budget.", color = Muted, fontSize = 11.sp, lineHeight = 16.sp)
                Button(
                    onClick = onClick,
                    shape = RoundedCornerShape(999.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = BrandGreen),
                    contentPadding = PaddingValues(horizontal = 14.dp, vertical = 8.dp)
                ) {
                    Text("Composer mon pack", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.width(5.dp))
                    Icon(Icons.Default.ArrowForward, contentDescription = null, modifier = Modifier.size(15.dp))
                }
            }
            Box(
                Modifier.size(65.dp).clip(RoundedCornerShape(16.dp)).background(SoftGreen),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Default.ShoppingBag, contentDescription = null, tint = BrandGreen, modifier = Modifier.size(34.dp))
            }
        }
    }
}

@Composable
private fun CategorySelector(
    categories: List<String>,
    selected: String,
    onSelect: (String) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        OutlinedButton(
            onClick = { expanded = true },
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp),
            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 11.dp)
        ) {
            Text(
                if (selected == "all") "Toutes les catégories" else selected,
                modifier = Modifier.weight(1f),
                color = Ink,
                fontSize = 12.sp
            )
            Icon(Icons.Default.ChevronRight, contentDescription = null, tint = Muted)
        }
        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
            modifier = Modifier.fillMaxWidth(0.86f).background(Color.White)
        ) {
            DropdownMenuItem(
                text = { Text("Toutes les catégories") },
                onClick = { onSelect("all"); expanded = false }
            )
            categories.forEach { item ->
                DropdownMenuItem(
                    text = { Text(item) },
                    onClick = { onSelect(item); expanded = false }
                )
            }
        }
    }
}

@Composable
private fun ProductGrid(
    products: List<StoreProduct>,
    onOpen: (StoreProduct) -> Unit,
    onAdd: (StoreProduct) -> Unit,
    onShare: (StoreProduct) -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(11.dp)) {
        products.chunked(2).forEach { rowProducts ->
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.Top
            ) {
                rowProducts.forEach { product ->
                    ProductCard(
                        product = product,
                        modifier = Modifier.weight(1f),
                        onOpen = { onOpen(product) },
                        onAdd = { onAdd(product) },
                        onShare = { onShare(product) }
                    )
                }
                if (rowProducts.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun ProductCard(
    product: StoreProduct,
    modifier: Modifier = Modifier,
    onOpen: () -> Unit,
    onAdd: () -> Unit,
    onShare: () -> Unit
) {
    Card(
        modifier = modifier.clickable(onClick = onOpen),
        shape = RoundedCornerShape(13.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, Border),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column {
            Box(
                Modifier.fillMaxWidth().height(140.dp).background(Color(0xFFF6FAF7)),
                contentAlignment = Alignment.Center
            ) {
                if (!product.imageUrl.isNullOrBlank()) {
                    AsyncImage(
                        model = product.imageUrl,
                        contentDescription = product.name,
                        modifier = Modifier.fillMaxSize().padding(6.dp),
                        contentScale = ContentScale.Fit
                    )
                } else {
                    Icon(Icons.Default.Inventory2, contentDescription = null, tint = BrandGreen, modifier = Modifier.size(45.dp))
                }
                if (product.promoActive && product.promoPrice != null && product.promoPrice < product.price) {
                    Surface(
                        Modifier.align(Alignment.TopStart).padding(8.dp),
                        color = Color(0xFFFCE9D5),
                        shape = RoundedCornerShape(6.dp)
                    ) {
                        Text("PROMOTION", modifier = Modifier.padding(horizontal = 6.dp, vertical = 4.dp), color = Color(0xFF9A4D12), fontSize = 8.sp, fontWeight = FontWeight.Black)
                    }
                }
                if (!product.isAvailable) {
                    Surface(
                        Modifier.align(Alignment.BottomStart).padding(7.dp),
                        color = Color(0xFF333D35),
                        shape = RoundedCornerShape(6.dp)
                    ) {
                        Text("Rupture", modifier = Modifier.padding(horizontal = 6.dp, vertical = 4.dp), color = Color.White, fontSize = 8.sp, fontWeight = FontWeight.Bold)
                    }
                }
                IconButton(
                    onClick = onShare,
                    modifier = Modifier.align(Alignment.TopEnd).padding(2.dp).size(32.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.92f))
                ) {
                    Icon(Icons.Default.Share, contentDescription = "Partager " + product.name, tint = BrandGreen, modifier = Modifier.size(16.dp))
                }
            }
            Column(
                Modifier.fillMaxWidth().padding(10.dp),
                verticalArrangement = Arrangement.spacedBy(5.dp)
            ) {
                product.category?.takeIf(String::isNotBlank)?.let {
                    Text(it.uppercase(Locale.ROOT), color = BrandGreen, fontSize = 8.sp, fontWeight = FontWeight.Black, letterSpacing = 0.5.sp, maxLines = 1)
                }
                Text(
                    product.name,
                    color = Ink,
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 13.sp,
                    lineHeight = 16.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    minLines = 2
                )
                if (product.catalogType == "product") {
                    Text(saleUnitLabel(product.saleUnit), color = Muted, fontSize = 9.sp, maxLines = 1)
                }
                Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
                    Text(formatMoney(product.effectivePrice), color = BrandGreen, fontWeight = FontWeight.Black, fontSize = 15.sp, maxLines = 1)
                    if (product.effectivePrice < product.price) {
                        Text(formatMoney(product.price), color = Muted, fontSize = 10.sp, textDecoration = TextDecoration.LineThrough, maxLines = 1)
                    }
                }
                Row(
                    Modifier.fillMaxWidth().padding(top = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(5.dp)
                ) {
                    OutlinedButton(
                        onClick = onOpen,
                        modifier = Modifier.weight(1f).height(36.dp),
                        contentPadding = PaddingValues(horizontal = 4.dp, vertical = 3.dp),
                        shape = RoundedCornerShape(9.dp)
                    ) {
                        Text("Détails", fontSize = 10.sp, maxLines = 1)
                    }
                    Button(
                        onClick = onAdd,
                        enabled = product.isAvailable && product.effectivePrice > 0.0,
                        modifier = Modifier.weight(1.15f).height(36.dp),
                        contentPadding = PaddingValues(horizontal = 4.dp, vertical = 3.dp),
                        shape = RoundedCornerShape(9.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = BrandGreen)
                    ) {
                        Text(
                            if (!product.isAvailable) "Rupture" else if (product.effectivePrice > 0.0) "Ajouter" else "À confirmer",
                            fontSize = 9.sp,
                            maxLines = 1
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun CatalogScreen(
    products: List<StoreProduct>,
    catalogType: String,
    loading: Boolean,
    onOpenProduct: (StoreProduct) -> Unit,
    onAdd: (StoreProduct) -> Unit,
    onShare: (StoreProduct) -> Unit,
    onComposePack: () -> Unit,
    onOpenTab: (AppTab) -> Unit
) {
    val pageTitle = when (catalogType) {
        "pack" -> "Packs de nettoyage"
        "tool" -> "Outils de nettoyage"
        else -> "Produits de nettoyage"
    }
    val eyebrow = when (catalogType) {
        "pack" -> "CATALOGUE"
        "tool" -> "OUTILS DE NETTOYAGE"
        else -> "À L’UNITÉ OU PAR COLIS"
    }
    val description = when (catalogType) {
        "pack" -> "Choisis une solution prête à l’emploi pour la maison ou ton activité."
        "tool" -> "Retrouve les accessoires et outils pratiques pour tes tâches de nettoyage."
        else -> "Choisissez le conditionnement proposé pour chaque référence, consultez ses caractéristiques et vérifiez sa disponibilité avant de l’ajouter au panier."
    }
    val matching = products.filter { it.catalogType == catalogType }
    val categories = matching.mapNotNull { it.category?.trim()?.takeIf(String::isNotBlank) }
        .distinct().sortedBy { it.lowercase(Locale.ROOT) }
    var search by rememberSaveable(catalogType) { mutableStateOf("") }
    var category by rememberSaveable(catalogType) { mutableStateOf("all") }
    val filtered = matching.filter { product ->
        val query = search.trim()
        val matchesSearch = query.isBlank() ||
            product.name.contains(query, ignoreCase = true) ||
            product.category.orEmpty().contains(query, ignoreCase = true) ||
            product.description.orEmpty().contains(query, ignoreCase = true) ||
            product.items.any { it.contains(query, ignoreCase = true) }
        val matchesCategory = category == "all" || product.category.equals(category, ignoreCase = true)
        matchesSearch && matchesCategory
    }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        Column(
            Modifier.fillMaxWidth().background(AppBackground).padding(horizontal = 18.dp, vertical = 30.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Eyebrow(eyebrow)
            Text(
                pageTitle,
                color = Ink,
                fontSize = 30.sp,
                lineHeight = 35.sp,
                letterSpacing = (-0.9).sp,
                fontWeight = FontWeight.Black
            )
            Text(description, color = Muted, fontSize = 13.sp, lineHeight = 20.sp)
        }
        Column(
            Modifier.fillMaxWidth().background(Color.White).padding(horizontal = 18.dp, vertical = 23.dp),
            verticalArrangement = Arrangement.spacedBy(13.dp)
        ) {
            OutlinedTextField(
                value = search,
                onValueChange = { search = it },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                placeholder = { Text(if (catalogType == "pack") "Rechercher un pack…" else "Rechercher un article…", fontSize = 13.sp) },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null, tint = Muted) },
                shape = RoundedCornerShape(12.dp)
            )
            CategorySelector(categories = categories, selected = category, onSelect = { category = it })
            if (catalogType == "pack") BudgetBuilderBanner(onClick = onComposePack)
            if (loading && matching.isEmpty()) {
                LoadingInline()
            } else if (filtered.isEmpty()) {
                EmptyState("Aucun résultat", "Modifie la recherche ou choisis une autre catégorie.")
            } else {
                Text(filtered.size.toString() + " article(s)", color = Muted, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                ProductGrid(
                    products = filtered.take(100),
                    onOpen = onOpenProduct,
                    onAdd = onAdd,
                    onShare = onShare
                )
            }
        }
        SiteFooter(onOpenTab = onOpenTab)
    }
}

@Composable
private fun SiteFooter(onOpenTab: (AppTab) -> Unit) {
    Column(
        Modifier.fillMaxWidth().background(FooterGreen).padding(horizontal = 20.dp, vertical = 27.dp),
        verticalArrangement = Arrangement.spacedBy(15.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(36.dp).clip(RoundedCornerShape(11.dp)).background(Color(0xFF238553)),
                contentAlignment = Alignment.Center
            ) {
                Text("S", color = Color.White, fontWeight = FontWeight.Black, fontSize = 20.sp)
            }
            Spacer(Modifier.width(9.dp))
            Text("SAMA-PACK", color = Color.White, fontWeight = FontWeight.Black, fontSize = 18.sp)
        }
        Text("Distribution de packs de nettoyage et d’hygiène à Dakar.", color = Color(0xFFB8C9BE), fontSize = 12.sp)
        Text("Navigation", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 12.sp)
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            TextButton(onClick = { onOpenTab(AppTab.HOME) }, contentPadding = PaddingValues(0.dp)) { Text("Accueil", color = Color(0xFFB8C9BE), fontSize = 11.sp) }
            TextButton(onClick = { onOpenTab(AppTab.PACKS) }, contentPadding = PaddingValues(0.dp)) { Text("Packs", color = Color(0xFFB8C9BE), fontSize = 11.sp) }
            TextButton(onClick = { onOpenTab(AppTab.PRODUCTS) }, contentPadding = PaddingValues(0.dp)) { Text("Produits", color = Color(0xFFB8C9BE), fontSize = 11.sp) }
        }
        Text("© 2026 SAMA-PACK. Tous droits réservés.", color = Color(0xFF7D9485), fontSize = 10.sp)
    }
}

@Composable
private fun HowScreen(onOpenTab: (AppTab) -> Unit) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        Column(
            Modifier.fillMaxWidth().background(Brush.linearGradient(listOf(Color(0xFFF8FAFC), Color.White, Color(0xFFF0FDF4)))).padding(horizontal = 20.dp, vertical = 34.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Eyebrow("GUIDE CLIENT SAMA-PACK")
            Text("Votre commande, de la sélection à la livraison.", color = Ink, fontSize = 31.sp, lineHeight = 36.sp, fontWeight = FontWeight.Black)
            Text("Retrouvez les étapes pour choisir les bons articles, passer commande en ligne, régler votre achat et suivre son avancement depuis votre compte.", color = Muted, fontSize = 14.sp, lineHeight = 21.sp)
            Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                GuidePill("Catalogue consultable")
                GuidePill("Paiement vérifié")
            }
            GuidePill("Suivi depuis votre compte")
        }
        Column(Modifier.padding(horizontal = 18.dp, vertical = 22.dp), verticalArrangement = Arrangement.spacedBy(13.dp)) {
            Text("Comment se déroule une commande ?", color = Ink, fontSize = 23.sp, fontWeight = FontWeight.Black)
            Text("Suivez ces quatre étapes pour commander directement sur la boutique.", color = Muted, fontSize = 12.sp)
            GuideStep("01", "Choisissez vos packs ou vos produits", "Parcourez Packs pour découvrir nos sélections prêtes à commander ou Produits pour acheter des articles à l’unité. Utilisez la recherche et les filtres, ouvrez Détails puis ajoutez les articles disponibles au panier.")
            GuideStep("02", "Vérifiez votre panier", "Ajustez les quantités ou retirez une ligne. Le sous-total et les frais de livraison sont affichés avant de continuer. Le montant définitif est recalculé côté serveur.")
            GuideStep("03", "Renseignez la livraison et choisissez le paiement", "Connectez-vous ou créez un compte, indiquez votre nom, votre téléphone et votre adresse. Choisissez le paiement en ligne ou l’option proposée à la livraison.")
            GuideStep("04", "Suivez votre commande depuis votre compte", "Retrouvez vos commandes et leur statut. Les informations de paiement sont actualisées après vérification de la transaction.")
            Button(onClick = { onOpenTab(AppTab.PACKS) }, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp), colors = ButtonDefaults.buttonColors(containerColor = BrandGreen)) {
                Text("Voir les packs")
            }
        }
        SiteFooter(onOpenTab = onOpenTab)
    }
}

@Composable
private fun GuidePill(label: String) {
    Surface(color = Color.White, shape = RoundedCornerShape(999.dp), border = androidx.compose.foundation.BorderStroke(1.dp, Border)) {
        Text(label, color = BrandGreen, modifier = Modifier.padding(horizontal = 10.dp, vertical = 7.dp), fontSize = 10.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun GuideStep(number: String, title: String, body: String) {
    Card(
        shape = RoundedCornerShape(17.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = androidx.compose.foundation.BorderStroke(1.dp, Border)
    ) {
        Column(Modifier.fillMaxWidth().padding(17.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
            Box(Modifier.size(39.dp).clip(RoundedCornerShape(12.dp)).background(SoftGreen), contentAlignment = Alignment.Center) {
                Text(number, color = BrandGreen, fontWeight = FontWeight.Black, fontSize = 13.sp)
            }
            Text(title, color = Ink, fontSize = 18.sp, fontWeight = FontWeight.Black)
            Text(body, color = Muted, fontSize = 13.sp, lineHeight = 20.sp)
        }
    }
}

@Composable
private fun ProfessionalsScreen(onContact: () -> Unit) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        Column(Modifier.fillMaxWidth().background(Brush.linearGradient(listOf(Color(0xFFF0FAF2), Color.White))).padding(horizontal = 20.dp, vertical = 35.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Eyebrow("B2B")
            Text("Approvisionnez votre structure sans perdre du temps.", color = Ink, fontSize = 31.sp, lineHeight = 36.sp, fontWeight = FontWeight.Black)
            Text("Bureaux, boutiques, écoles, restaurants et événements : SAMA-PACK accompagne les besoins réguliers ou ponctuels en produits d’entretien et d’hygiène.", color = Muted, fontSize = 14.sp, lineHeight = 21.sp)
        }
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            InfoTile("Commande récurrente", "Préparez vos besoins réguliers et facilitez le réapprovisionnement de votre structure.")
            InfoTile("Demande de devis", "Transmettez les références, quantités et fréquences souhaitées pour recevoir une proposition.")
            InfoTile("Approvisionnement", "Produits disponibles à l’unité ou par colis selon les références.")
            Button(onClick = onContact, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp), colors = ButtonDefaults.buttonColors(containerColor = BrandGreen)) {
                Text("Demander un devis sur WhatsApp")
            }
        }
        SiteFooter(onOpenTab = {})
    }
}

@Composable
private fun ContactScreen(phone: String, onWhatsApp: () -> Unit) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        Column(Modifier.fillMaxWidth().background(Brush.linearGradient(listOf(Color(0xFFF5FAF6), Color.White))).padding(horizontal = 20.dp, vertical = 34.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Eyebrow("CONTACT")
            Text("Une question avant de commander ?", color = Ink, fontSize = 30.sp, lineHeight = 35.sp, fontWeight = FontWeight.Black)
            Text("Écris-nous sur WhatsApp pour obtenir un renseignement sur un produit, une disponibilité ou une commande.", color = Muted, fontSize = 14.sp, lineHeight = 21.sp)
        }
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Card(shape = RoundedCornerShape(16.dp), colors = CardDefaults.cardColors(containerColor = Color.White), border = androidx.compose.foundation.BorderStroke(1.dp, Border)) {
                Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(48.dp).clip(RoundedCornerShape(14.dp)).background(SoftGreen), contentAlignment = Alignment.Center) {
                        Text("💬", fontSize = 23.sp)
                    }
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text("WhatsApp", color = Ink, fontWeight = FontWeight.Black)
                        Text(phone.ifBlank { "Contact commercial SAMA-PACK" }, color = Muted, fontSize = 11.sp)
                    }
                }
            }
            Button(onClick = onWhatsApp, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp), colors = ButtonDefaults.buttonColors(containerColor = BrandGreen)) {
                Text("Ouvrir WhatsApp")
            }
        }
        SiteFooter(onOpenTab = {})
    }
}

@Composable
private fun InfoTile(title: String, description: String) {
    Card(shape = RoundedCornerShape(15.dp), colors = CardDefaults.cardColors(containerColor = Color.White), border = androidx.compose.foundation.BorderStroke(1.dp, Border)) {
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
            Text(title, color = Ink, fontWeight = FontWeight.Black, fontSize = 15.sp)
            Text(description, color = Muted, fontSize = 12.sp, lineHeight = 18.sp)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun BudgetBuilderSheet(
    products: List<StoreProduct>,
    onDismiss: () -> Unit,
    onAdd: (Map<String, Int>) -> Unit
) {
    val available = products.filter { it.catalogType != "pack" && it.isAvailable && it.effectivePrice > 0.0 }
    var budgetText by rememberSaveable { mutableStateOf("5000") }
    var selected by remember { mutableStateOf<Map<String, Int>>(emptyMap()) }
    var feedback by remember { mutableStateOf<String?>(null) }
    val productMap = available.associateBy { it.id }
    val total = selected.entries.sumOf { (id, qty) -> (productMap[id]?.effectivePrice ?: 0.0) * qty }
    val budget = budgetText.toDoubleOrNull() ?: 0.0

    fun suggestSelection() {
        val amount = budgetText.toDoubleOrNull() ?: 0.0
        if (amount < 500.0 || amount > 250000.0) {
            selected = emptyMap()
            feedback = "Saisis un budget compris entre 500 et 250 000 FCFA."
            return
        }
        val candidates = available.filter { it.effectivePrice <= amount }.shuffled()
        if (candidates.isEmpty()) {
            selected = emptyMap()
            feedback = "Aucun produit disponible ne correspond à ce budget."
            return
        }
        val proposal = linkedMapOf<String, Int>()
        var sum = 0.0
        val target = amount * 0.82
        candidates.forEach { product ->
            if (sum < target && sum + product.effectivePrice <= amount) {
                proposal[product.id] = 1
                sum += product.effectivePrice
            }
        }
        if (proposal.isEmpty()) {
            val first = candidates.first()
            proposal[first.id] = 1
            sum = first.effectivePrice
        }
        selected = proposal
        feedback = "Proposition adaptée à ton budget. Tu peux modifier les articles et les quantités."
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = Color.White
    ) {
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 18.dp).padding(bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Eyebrow("PACK PERSONNALISÉ")
            Text("Compose ton pack selon ton budget", color = Ink, fontSize = 24.sp, lineHeight = 29.sp, fontWeight = FontWeight.Black)
            Text("Choisis ton montant, puis ajuste librement la sélection proposée sans dépasser ton budget.", color = Muted, fontSize = 12.sp, lineHeight = 18.sp)
            OutlinedTextField(
                value = budgetText,
                onValueChange = { budgetText = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Ton budget (FCFA)") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                shape = RoundedCornerShape(12.dp)
            )
            Button(onClick = ::suggestSelection, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(11.dp), colors = ButtonDefaults.buttonColors(containerColor = BrandGreen)) {
                Text("Proposer une sélection")
            }
            feedback?.let { Text(it, color = Muted, fontSize = 11.sp, lineHeight = 16.sp) }
            if (selected.isNotEmpty()) {
                Text("Ta sélection", color = Ink, fontWeight = FontWeight.Black, fontSize = 16.sp)
                selected.toList().forEach { (id, quantity) ->
                    val product = productMap[id] ?: return@forEach
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(product.name, color = Ink, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                            Text(formatMoney(product.effectivePrice) + " / " + saleUnitLabel(product.saleUnit), color = Muted, fontSize = 10.sp)
                        }
                        IconButton(onClick = {
                            val next = selected.toMutableMap()
                            if (quantity <= 1) next.remove(id) else next[id] = quantity - 1
                            selected = next
                        }, modifier = Modifier.size(31.dp)) {
                            Icon(Icons.Default.Remove, contentDescription = "Diminuer la quantité", tint = BrandGreen, modifier = Modifier.size(16.dp))
                        }
                        Text(quantity.toString(), color = Ink, fontWeight = FontWeight.Bold)
                        IconButton(onClick = {
                            val next = selected.toMutableMap()
                            val nextTotal = total + product.effectivePrice
                            if (nextTotal <= budget && quantity < 99) next[id] = quantity + 1
                            selected = next
                        }, modifier = Modifier.size(31.dp)) {
                            Icon(Icons.Default.Add, contentDescription = "Augmenter la quantité", tint = BrandGreen, modifier = Modifier.size(16.dp))
                        }
                    }
                    Divider(color = Border)
                }
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text("Total du pack", modifier = Modifier.weight(1f), color = Ink, fontWeight = FontWeight.Bold)
                    Text(formatMoney(total), color = BrandGreen, fontWeight = FontWeight.Black, fontSize = 17.sp)
                }
            }
            Text("Articles disponibles pour composer ton pack", color = Ink, fontWeight = FontWeight.Black, fontSize = 15.sp)
            if (available.isEmpty()) {
                EmptyState("Aucun produit disponible", "Le composeur sera accessible dès que des produits individuels seront publiés.")
            } else {
                available.take(12).forEach { product ->
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(product.name, color = Ink, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                            Text(formatMoney(product.effectivePrice) + " / " + saleUnitLabel(product.saleUnit), color = Muted, fontSize = 10.sp)
                        }
                        TextButton(onClick = {
                            val next = selected.toMutableMap()
                            val qty = next[product.id] ?: 0
                            if (total + product.effectivePrice <= budget && qty < 99) {
                                next[product.id] = qty + 1
                                selected = next
                            } else {
                                feedback = "Cet article ferait dépasser ton budget."
                            }
                        }) {
                            Text(if (selected.containsKey(product.id)) "Ajouter +" else "Ajouter", color = BrandGreen, fontSize = 11.sp)
                        }
                    }
                    Divider(color = Border)
                }
            }
            Button(
                onClick = { onAdd(selected) },
                enabled = selected.isNotEmpty() && total > 0.0 && total <= budget,
                modifier = Modifier.fillMaxWidth().height(50.dp),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = BrandGreen)
            ) {
                Text("Ajouter mon pack au panier")
            }
            Text("Les frais de livraison s’ajoutent au panier. Aucun paiement ne sera lancé automatiquement.", color = Muted, fontSize = 10.sp, lineHeight = 15.sp)
        }
    }
}



@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ProductDetailsSheet(
    product: StoreProduct,
    onDismiss: () -> Unit,
    onAdd: () -> Unit
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = Color.White
    ) {
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(bottom = 30.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            AsyncImage(
                model = product.imageUrl,
                contentDescription = product.name,
                modifier = Modifier.fillMaxWidth().height(230.dp).clip(RoundedCornerShape(18.dp)).background(Color(0xFFF6FAF7)),
                contentScale = ContentScale.Fit
            )
            product.category?.takeIf { it.isNotBlank() }?.let {
                Text(it.uppercase(Locale.ROOT), color = BrandGreen, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Black, letterSpacing = 1.sp)
            }
            Text(product.name, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.ExtraBold, color = Ink)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(formatMoney(product.effectivePrice), color = BrandGreen, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.ExtraBold)
                if (product.effectivePrice < product.price) {
                    Spacer(Modifier.width(9.dp))
                    Text(formatMoney(product.price), color = Muted, style = MaterialTheme.typography.bodyMedium)
                }
            }
            Text(saleUnitLabel(product.saleUnit), color = Muted, style = MaterialTheme.typography.labelLarge)
            if (!product.isAvailable) {
                Text("Cet article est actuellement en rupture de stock.", color = Color(0xFF9A4D12))
            }
            product.description?.takeIf { it.isNotBlank() }?.let {
                Text("Description", color = Ink, fontWeight = FontWeight.Bold)
                Text(it, color = Muted, style = MaterialTheme.typography.bodyMedium)
            }
            if (product.items.isNotEmpty()) {
                Text(if (product.catalogType == "pack") "Composition du pack" else "Caractéristiques", color = Ink, fontWeight = FontWeight.Bold)
                Column(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(13.dp)).background(AppBackground).padding(13.dp),
                    verticalArrangement = Arrangement.spacedBy(7.dp)
                ) {
                    product.items.forEach { item ->
                        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("•", color = BrandGreen, fontWeight = FontWeight.Black)
                            Text(item, color = Muted, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
                        }
                    }
                }
            }
            product.brand?.takeIf { it.isNotBlank() }?.let {
                Text("Marque : $it", color = Muted, style = MaterialTheme.typography.bodySmall)
            }
            Button(
                onClick = onAdd,
                enabled = product.isAvailable,
                modifier = Modifier.fillMaxWidth().height(52.dp),
                shape = RoundedCornerShape(15.dp)
            ) {
                Icon(Icons.Default.ShoppingCart, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text(if (product.isAvailable) "Ajouter au panier" else "Indisponible", fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun CartScreen(
    state: SamaPackState,
    viewModel: SamaPackViewModel,
    onCheckout: () -> Unit,
    onContinueShopping: () -> Unit
) {
    val productMap = state.products.associateBy { it.id }
    val lines = state.cart.mapNotNull { (id, quantity) -> productMap[id]?.let { it to quantity } }
    val subtotal = viewModel.cartSubtotal()
    val delivery = state.settings.deliveryFee

    Column(Modifier.fillMaxSize().padding(horizontal = 18.dp)) {
        Spacer(Modifier.height(8.dp))
        Text("Votre panier", style = MaterialTheme.typography.headlineSmall, color = Ink, fontWeight = FontWeight.ExtraBold)
        Text("${lines.sumOf { it.second }} article(s)", color = Muted)
        Spacer(Modifier.height(14.dp))
        if (lines.isEmpty()) {
            EmptyState("Votre panier est vide", "Ajoutez des produits du catalogue pour préparer votre commande.")
            OutlinedButton(onClick = onContinueShopping, modifier = Modifier.fillMaxWidth()) {
                Text("Découvrir le catalogue")
            }
        } else {
            LazyColumn(
                modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(bottom = 14.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                items(lines, key = { it.first.id }) { (product, quantity) ->
                    CartLineCard(
                        product = product,
                        quantity = quantity,
                        onIncrease = { viewModel.setQuantity(product.id, quantity + 1) },
                        onDecrease = { viewModel.setQuantity(product.id, quantity - 1) },
                        onRemove = { viewModel.setQuantity(product.id, 0) }
                    )
                }
            }
            Card(
                shape = RoundedCornerShape(22.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White)
            ) {
                Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
                    PriceRow("Sous-total", formatMoney(subtotal))
                    PriceRow("Livraison estimée", formatMoney(delivery))
                    Divider(color = Border)
                    PriceRow("Total estimé", formatMoney(subtotal + delivery), strong = true)
                    Text(
                        "Le montant définitif est recalculé par SAMA-PACK au moment de la validation.",
                        color = Muted,
                        style = MaterialTheme.typography.labelSmall
                    )
                    Button(
                        onClick = onCheckout,
                        modifier = Modifier.fillMaxWidth().height(52.dp),
                        shape = RoundedCornerShape(15.dp),
                        enabled = !state.busy
                    ) {
                        Text(if (state.userId == null) "Se connecter pour commander" else "Valider ma commande", fontWeight = FontWeight.Bold)
                        Spacer(Modifier.width(8.dp))
                        Icon(Icons.Default.ArrowForward, contentDescription = null)
                    }
                }
            }
            Spacer(Modifier.height(12.dp))
        }
    }
}

@Composable
private fun CartLineCard(
    product: StoreProduct,
    quantity: Int,
    onIncrease: () -> Unit,
    onDecrease: () -> Unit,
    onRemove: () -> Unit
) {
    Card(shape = RoundedCornerShape(18.dp), colors = CardDefaults.cardColors(containerColor = Color.White)) {
        Row(Modifier.fillMaxWidth().padding(11.dp), verticalAlignment = Alignment.CenterVertically) {
            AsyncImage(
                model = product.imageUrl,
                contentDescription = product.name,
                modifier = Modifier.size(82.dp).clip(RoundedCornerShape(13.dp)).background(Color(0xFFF0F3EF)),
                contentScale = ContentScale.Crop
            )
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(product.name, color = Ink, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(formatMoney(product.effectivePrice), color = BrandGreen, fontWeight = FontWeight.Bold)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = onDecrease, modifier = Modifier.size(30.dp)) {
                        Icon(Icons.Default.Remove, contentDescription = "Diminuer")
                    }
                    Text(quantity.toString(), fontWeight = FontWeight.Bold)
                    IconButton(onClick = onIncrease, modifier = Modifier.size(30.dp)) {
                        Icon(Icons.Default.Add, contentDescription = "Augmenter")
                    }
                    Spacer(Modifier.weight(1f))
                    IconButton(onClick = onRemove, modifier = Modifier.size(30.dp)) {
                        Icon(Icons.Default.DeleteOutline, contentDescription = "Retirer", tint = Muted)
                    }
                }
            }
        }
    }
}

@Composable
private fun OrdersScreen(
    state: SamaPackState,
    viewModel: SamaPackViewModel,
    onSignIn: () -> Unit
) {
    Column(Modifier.fillMaxSize().padding(horizontal = 18.dp)) {
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Mes commandes", style = MaterialTheme.typography.headlineSmall, color = Ink, fontWeight = FontWeight.ExtraBold)
                Text("Suivez l'évolution de vos achats", color = Muted)
            }
            IconButton(onClick = { viewModel.refresh() }) {
                Icon(Icons.Default.Refresh, contentDescription = "Actualiser")
            }
        }
        Spacer(Modifier.height(12.dp))
        when {
            state.userId == null -> {
                EmptyState("Connectez-vous pour suivre vos commandes", "Votre historique et vos paiements seront regroupés ici.")
                Button(onClick = onSignIn, modifier = Modifier.fillMaxWidth()) { Text("Se connecter") }
            }
            state.orders.isEmpty() -> EmptyState("Aucune commande pour le moment", "Vos prochaines commandes apparaîtront ici.")
            else -> LazyColumn(
                modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(bottom = 20.dp),
                verticalArrangement = Arrangement.spacedBy(11.dp)
            ) {
                items(state.orders, key = { it.id }) { order ->
                    OrderCard(
                        order = order,
                        busy = state.busy,
                        onRetryPayment = { viewModel.retryPayment(order.id) },
                        onVerifyPayment = { viewModel.verifyPayment(order.id) }
                    )
                }
            }
        }
    }
}

@Composable
private fun OrderCard(
    order: StoreOrder,
    busy: Boolean,
    onRetryPayment: () -> Unit,
    onVerifyPayment: () -> Unit
) {
    val waiting = order.status == "awaiting_payment" || order.status == "awaiting_delivery_payment"
    Card(shape = RoundedCornerShape(19.dp), colors = CardDefaults.cardColors(containerColor = Color.White)) {
        Column(Modifier.fillMaxWidth().padding(15.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Commande ${order.id.takeLast(8)}", fontWeight = FontWeight.Bold, color = Ink)
                    Text(order.createdAt?.take(10) ?: "Date non disponible", color = Muted, style = MaterialTheme.typography.labelSmall)
                }
                Surface(
                    color = if (waiting) Warm else SoftGreen,
                    shape = RoundedCornerShape(9.dp)
                ) {
                    Text(
                        orderStatusLabel(order.status),
                        modifier = Modifier.padding(horizontal = 9.dp, vertical = 5.dp),
                        color = if (waiting) Color(0xFF9A4D12) else BrandGreen,
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
            Divider(color = Border)
            PriceRow("Total", formatMoney(order.total), strong = true)
            if (order.paymentStatus != null) {
                PriceRow("Paiement", paymentStatusLabel(order.paymentStatus))
            }
            order.deliveryAddress?.takeIf { it.isNotBlank() }?.let {
                Text(it, color = Muted, style = MaterialTheme.typography.bodySmall, maxLines = 2)
            }
            if (waiting) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = onVerifyPayment, enabled = !busy, modifier = Modifier.weight(1f)) {
                        Text("Vérifier")
                    }
                    Button(onClick = onRetryPayment, enabled = !busy, modifier = Modifier.weight(1f)) {
                        Text("Reprendre le paiement")
                    }
                }
            }
        }
    }
}

@Composable
private fun AccountScreen(state: SamaPackState, viewModel: SamaPackViewModel) {
    if (state.userId == null) {
        AuthScreen(state, viewModel)
    } else {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 18.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Spacer(Modifier.height(8.dp))
            Text("Mon compte", style = MaterialTheme.typography.headlineSmall, color = Ink, fontWeight = FontWeight.ExtraBold)
            Card(shape = RoundedCornerShape(22.dp), colors = CardDefaults.cardColors(containerColor = Color.White)) {
                Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Box(Modifier.size(58.dp).clip(CircleShape).background(SoftGreen), contentAlignment = Alignment.Center) {
                        Icon(Icons.Default.AccountCircle, contentDescription = null, tint = BrandGreen, modifier = Modifier.size(37.dp))
                    }
                    Text(state.profile?.fullName ?: "Client SAMA-PACK", color = Ink, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    Text(state.email.orEmpty(), color = Muted)
                    Divider(color = Border)
                    ProfileLine("Téléphone", state.profile?.phone ?: "Non renseigné")
                    ProfileLine("Ville", state.profile?.deliveryCity ?: "Non renseignée")
                    ProfileLine("Commune", state.profile?.deliveryCommune ?: "Non renseignée")
                    ProfileLine("Quartier", state.profile?.deliveryNeighborhood ?: "Non renseigné")
                    ProfileLine("Adresse", state.profile?.deliveryAddress ?: "Non renseignée")
                }
            }
            OutlinedButton(
                onClick = { viewModel.signOut() },
                modifier = Modifier.fillMaxWidth(),
                enabled = !state.busy
            ) {
                Icon(Icons.Default.Logout, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text("Se déconnecter")
            }
            Text("Vos informations sont protégées par votre compte SAMA-PACK.", color = Muted, style = MaterialTheme.typography.labelSmall)
        }
    }
}

@Composable
private fun ProfileLine(label: String, value: String) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(label, color = Muted, style = MaterialTheme.typography.labelSmall)
        Text(value, color = Ink, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun AuthScreen(state: SamaPackState, viewModel: SamaPackViewModel) {
    var creatingAccount by rememberSaveable { mutableStateOf(false) }
    var email by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var name by rememberSaveable { mutableStateOf("") }
    var phone by rememberSaveable { mutableStateOf("+221") }
    var city by rememberSaveable { mutableStateOf("Dakar") }
    var commune by rememberSaveable { mutableStateOf("") }
    var neighborhood by rememberSaveable { mutableStateOf("") }
    var address by rememberSaveable { mutableStateOf("") }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 18.dp),
        verticalArrangement = Arrangement.spacedBy(11.dp)
    ) {
        Spacer(Modifier.height(8.dp))
        Text(if (creatingAccount) "Créer mon compte" else "Bienvenue", style = MaterialTheme.typography.headlineSmall, color = Ink, fontWeight = FontWeight.ExtraBold)
        Text(
            if (creatingAccount) "Un compte pour retrouver vos commandes et vos informations de livraison."
            else "Connectez-vous pour commander et retrouver vos achats.",
            color = Muted
        )
        Card(shape = RoundedCornerShape(22.dp), colors = CardDefaults.cardColors(containerColor = Color.White)) {
            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                if (creatingAccount) {
                    FormField(name, { name = it }, "Nom complet")
                }
                FormField(email, { email = it }, "Adresse e-mail", keyboardType = KeyboardType.Email)
                FormField(password, { password = it }, "Mot de passe", keyboardType = KeyboardType.Password, password = true)
                if (creatingAccount) {
                    Divider(color = Border)
                    Text("Informations de livraison", color = Ink, fontWeight = FontWeight.Bold)
                    FormField(phone, { phone = it }, "WhatsApp avec indicatif (+221…)", keyboardType = KeyboardType.Phone)
                    FormField(city, { city = it }, "Ville")
                    FormField(commune, { commune = it }, "Commune")
                    FormField(neighborhood, { neighborhood = it }, "Quartier")
                    FormField(address, { address = it }, "Adresse détaillée")
                    Text("Ces champs créent votre profil client utilisé lors de vos commandes.", color = Muted, style = MaterialTheme.typography.labelSmall)
                }
                Button(
                    onClick = {
                        if (creatingAccount) {
                            viewModel.signUp(name, email, phone, password, city, commune, neighborhood, address)
                        } else {
                            viewModel.signIn(email, password)
                        }
                    },
                    enabled = !state.busy,
                    modifier = Modifier.fillMaxWidth().height(50.dp),
                    shape = RoundedCornerShape(14.dp)
                ) {
                    if (state.busy) CircularProgressIndicator(Modifier.size(19.dp), strokeWidth = 2.dp, color = Color.White)
                    else Text(if (creatingAccount) "Créer mon compte" else "Se connecter", fontWeight = FontWeight.Bold)
                }
                TextButton(
                    onClick = { creatingAccount = !creatingAccount },
                    modifier = Modifier.align(Alignment.CenterHorizontally)
                ) {
                    Text(if (creatingAccount) "J'ai déjà un compte · Me connecter" else "Nouveau client · Créer un compte")
                }
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(Icons.Default.Lock, contentDescription = null, tint = BrandGreen, modifier = Modifier.size(18.dp))
            Text("Connexion sécurisée via Supabase Auth.", color = Muted, style = MaterialTheme.typography.labelSmall)
        }
        Spacer(Modifier.height(12.dp))
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CheckoutSheet(
    profile: CustomerProfile?,
    deliveryFee: Double,
    subtotal: Double,
    busy: Boolean,
    onDismiss: () -> Unit,
    onConfirm: (CheckoutInput, String) -> Unit
) {
    var name by rememberSaveable { mutableStateOf(profile?.fullName.orEmpty()) }
    var phone by rememberSaveable { mutableStateOf(profile?.phone.orEmpty()) }
    var address by rememberSaveable { mutableStateOf(profile?.deliveryAddress.orEmpty()) }
    var zone by rememberSaveable {
        mutableStateOf(
            listOfNotNull(profile?.deliveryCity, profile?.deliveryCommune, profile?.deliveryNeighborhood)
                .filter { it.isNotBlank() }.joinToString(" · ")
        )
    }
    var slot by rememberSaveable { mutableStateOf("À convenir") }
    var paymentChoice by rememberSaveable { mutableStateOf("pay_now") }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = Color.White
    ) {
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Text("Finaliser ma commande", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.ExtraBold, color = Ink)
            Text("Vérifiez votre adresse et choisissez le mode de paiement.", color = Muted)
            FormField(name, { name = it }, "Nom du destinataire")
            FormField(phone, { phone = it }, "Téléphone WhatsApp", keyboardType = KeyboardType.Phone)
            FormField(address, { address = it }, "Adresse de livraison")
            FormField(zone, { zone = it }, "Zone / Commune / Quartier")
            FormField(slot, { slot = it }, "Créneau souhaité")
            Divider(color = Border)
            Text("Paiement", color = Ink, fontWeight = FontWeight.Bold)
            PaymentChoice(
                selected = paymentChoice == "pay_now",
                title = "Payer la commande maintenant",
                detail = "Le total des articles et de la livraison est réglé en ligne.",
                onClick = { paymentChoice = "pay_now" }
            )
            PaymentChoice(
                selected = paymentChoice == "pay_later",
                title = "Payer la livraison maintenant",
                detail = "Les frais de livraison sont réglés en ligne ; le solde des articles est payé à la livraison.",
                onClick = { paymentChoice = "pay_later" }
            )
            Card(shape = RoundedCornerShape(16.dp), colors = CardDefaults.cardColors(containerColor = AppBackground)) {
                Column(Modifier.fillMaxWidth().padding(13.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    PriceRow("Sous-total", formatMoney(subtotal))
                    PriceRow("Livraison estimée", formatMoney(deliveryFee))
                    Divider(color = Border)
                    PriceRow("Total estimé", formatMoney(subtotal + deliveryFee), strong = true)
                }
            }
            Button(
                onClick = {
                    onConfirm(
                        CheckoutInput(name, phone, address, zone, slot),
                        paymentChoice
                    )
                },
                enabled = !busy && name.isNotBlank() && phone.isNotBlank() && address.isNotBlank() && zone.isNotBlank(),
                modifier = Modifier.fillMaxWidth().height(52.dp),
                shape = RoundedCornerShape(15.dp)
            ) {
                if (busy) CircularProgressIndicator(Modifier.size(19.dp), color = Color.White, strokeWidth = 2.dp)
                else Text("Confirmer et continuer", fontWeight = FontWeight.Bold)
            }
            Text("Les prix, la disponibilité et les frais réels sont confirmés par le serveur lors de la création de la commande.", color = Muted, style = MaterialTheme.typography.labelSmall)
        }
    }
}

@Composable
private fun PaymentChoice(selected: Boolean, title: String, detail: String, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(if (selected) SoftGreen else AppBackground).clickable(onClick = onClick).padding(9.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        RadioButton(selected = selected, onClick = onClick)
        Spacer(Modifier.width(5.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(title, color = Ink, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium)
            Text(detail, color = Muted, style = MaterialTheme.typography.labelSmall)
        }
    }
}

@Composable
private fun FormField(
    value: String,
    onChange: (String) -> Unit,
    label: String,
    keyboardType: KeyboardType = KeyboardType.Text,
    password: Boolean = false
) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        modifier = Modifier.fillMaxWidth(),
        singleLine = !password,
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
        visualTransformation = if (password) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
        shape = RoundedCornerShape(13.dp)
    )
}

@Composable
private fun SectionTitle(title: String, subtitle: String) {
    Column(Modifier.padding(horizontal = 18.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(title, color = Ink, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.ExtraBold)
        Text(subtitle, color = Muted, style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun PriceRow(label: String, value: String, strong: Boolean = false) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(label, color = if (strong) Ink else Muted, modifier = Modifier.weight(1f), fontWeight = if (strong) FontWeight.Bold else FontWeight.Normal)
        Text(value, color = if (strong) BrandGreen else Ink, fontWeight = if (strong) FontWeight.ExtraBold else FontWeight.SemiBold)
    }
}

@Composable
private fun EmptyState(title: String, subtitle: String) {
    Column(
        Modifier.fillMaxWidth().padding(vertical = 28.dp, horizontal = 18.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Box(Modifier.size(62.dp).clip(CircleShape).background(SoftGreen), contentAlignment = Alignment.Center) {
            Icon(Icons.Default.ShoppingBag, contentDescription = null, tint = BrandGreen, modifier = Modifier.size(29.dp))
        }
        Text(title, color = Ink, fontWeight = FontWeight.Bold)
        Text(subtitle, color = Muted, style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun LoadingInline() {
    Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(color = BrandGreen, modifier = Modifier.size(28.dp), strokeWidth = 2.5.dp)
    }
}

private fun formatMoney(value: Double): String {
    val formatted = NumberFormat.getIntegerInstance(Locale.FRANCE).format(value.roundToLong())
    return "$formatted FCFA"
}

private fun saleUnitLabel(unit: String): String = when (unit.lowercase(Locale.ROOT)) {
    "carton" -> "Prix au colis"
    "pack" -> "Prix du pack"
    else -> "Prix à l'unité"
}

private fun orderStatusLabel(status: String): String = when (status) {
    "new" -> "Reçue"
    "confirmed" -> "Confirmée"
    "processing" -> "En préparation"
    "prepared" -> "Préparée"
    "out_for_delivery" -> "En livraison"
    "delivered" -> "Livrée"
    "cancelled" -> "Annulée"
    "awaiting_payment" -> "Paiement en attente"
    "awaiting_delivery_payment" -> "Livraison à régler"
    else -> status.replace('_', ' ').replaceFirstChar { it.uppercase() }
}

private fun paymentStatusLabel(status: String): String = when (status) {
    "unpaid" -> "Non payé"
    "pending" -> "En attente"
    "partially_paid" -> "Partiellement payé"
    "paid" -> "Payé"
    "failed" -> "Échec"
    "refund_review" -> "Vérification du remboursement"
    else -> status
}
