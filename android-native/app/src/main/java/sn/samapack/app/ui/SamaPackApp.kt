package sn.samapack.app.ui

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
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
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.ReceiptLong
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.ShoppingBag
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Divider
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
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil3.compose.AsyncImage
import sn.samapack.app.data.CheckoutInput
import sn.samapack.app.data.CustomerProfile
import sn.samapack.app.data.StoreOrder
import sn.samapack.app.data.StoreProduct
import java.text.NumberFormat
import java.util.Locale
import kotlin.math.roundToLong

private val BrandGreen = Color(0xFF166534)
private val BrandGreenDark = Color(0xFF104B28)
private val AppBackground = Color(0xFFF5F7F2)
private val Ink = Color(0xFF17251D)
private val Muted = Color(0xFF66756A)
private val Border = Color(0xFFE2E9E1)
private val SoftGreen = Color(0xFFE7F2E8)
private val Warm = Color(0xFFF8F1E6)

private enum class AppTab(val label: String) {
    HOME("Accueil"),
    CATALOG("Catalogue"),
    CART("Panier"),
    ORDERS("Commandes"),
    ACCOUNT("Compte")
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SamaPackApp(viewModel: SamaPackViewModel = viewModel()) {
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current
    var currentTab by rememberSaveable { mutableStateOf(AppTab.HOME) }
    var selectedProduct by remember { mutableStateOf<StoreProduct?>(null) }
    var checkoutOpen by rememberSaveable { mutableStateOf(false) }
    val snackbar = remember { SnackbarHostState() }

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

    BackHandler(enabled = selectedProduct != null || checkoutOpen) {
        if (checkoutOpen) checkoutOpen = false else selectedProduct = null
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
                TopAppBar(
                    title = {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                modifier = Modifier
                                    .size(36.dp)
                                    .clip(RoundedCornerShape(11.dp))
                                    .background(BrandGreen),
                                contentAlignment = Alignment.Center
                            ) {
                                Text("S", color = Color.White, fontWeight = FontWeight.Black)
                            }
                            Spacer(Modifier.width(10.dp))
                            Column(verticalArrangement = Arrangement.spacedBy((-3).dp)) {
                                Text("SAMA-PACK", fontWeight = FontWeight.ExtraBold, color = Ink)
                                Text("Hygiène & entretien", color = Muted, style = MaterialTheme.typography.labelSmall)
                            }
                        }
                    },
                    actions = {
                        IconButton(onClick = { viewModel.refresh() }) {
                            Icon(Icons.Default.Refresh, contentDescription = "Actualiser", tint = BrandGreen)
                        }
                        Box(contentAlignment = Alignment.TopEnd) {
                            IconButton(onClick = { currentTab = AppTab.CART }) {
                                Icon(Icons.Default.ShoppingCart, contentDescription = "Panier", tint = BrandGreen)
                            }
                            if (viewModel.productCount() > 0) {
                                Box(
                                    modifier = Modifier
                                        .padding(top = 3.dp, end = 4.dp)
                                        .size(17.dp)
                                        .clip(CircleShape)
                                        .background(Color(0xFFEA8C28)),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(
                                        viewModel.productCount().coerceAtMost(99).toString(),
                                        color = Color.White,
                                        style = MaterialTheme.typography.labelSmall,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                            }
                        }
                    }
                )
            },
            bottomBar = {
                NavigationBar(containerColor = Color.White, tonalElevation = 8.dp) {
                    AppTab.entries.forEach { tab ->
                        val icon = when (tab) {
                            AppTab.HOME -> Icons.Default.Home
                            AppTab.CATALOG -> Icons.Default.ShoppingBag
                            AppTab.CART -> Icons.Default.ShoppingCart
                            AppTab.ORDERS -> Icons.Default.ReceiptLong
                            AppTab.ACCOUNT -> Icons.Default.Person
                        }
                        NavigationBarItem(
                            selected = currentTab == tab,
                            onClick = { currentTab = tab },
                            icon = {
                                Box {
                                    Icon(icon, contentDescription = tab.label)
                                    if (tab == AppTab.CART && viewModel.productCount() > 0) {
                                        Box(
                                            Modifier
                                                .align(Alignment.TopEnd)
                                                .size(7.dp)
                                                .clip(CircleShape)
                                                .background(Color(0xFFEA8C28))
                                        )
                                    }
                                }
                            },
                            label = { Text(tab.label, style = MaterialTheme.typography.labelSmall) }
                        )
                    }
                }
            }
        ) { padding ->
            Box(Modifier.fillMaxSize().padding(padding)) {
                when (currentTab) {
                    AppTab.HOME -> HomeScreen(
                        products = state.products,
                        loading = state.loading,
                        onOpenCatalog = { currentTab = AppTab.CATALOG },
                        onOpenProduct = { selectedProduct = it },
                        onAdd = viewModel::addToCart,
                        deliveryFee = state.settings.deliveryFee
                    )
                    AppTab.CATALOG -> CatalogScreen(
                        products = state.products,
                        loading = state.loading,
                        onOpenProduct = { selectedProduct = it },
                        onAdd = viewModel::addToCart
                    )
                    AppTab.CART -> CartScreen(
                        state = state,
                        viewModel = viewModel,
                        onCheckout = {
                            if (state.userId == null) currentTab = AppTab.ACCOUNT
                            else checkoutOpen = true
                        },
                        onContinueShopping = { currentTab = AppTab.CATALOG }
                    )
                    AppTab.ORDERS -> OrdersScreen(
                        state = state,
                        viewModel = viewModel,
                        onSignIn = { currentTab = AppTab.ACCOUNT }
                    )
                    AppTab.ACCOUNT -> AccountScreen(state, viewModel)
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
private fun HomeScreen(
    products: List<StoreProduct>,
    loading: Boolean,
    deliveryFee: Double,
    onOpenCatalog: () -> Unit,
    onOpenProduct: (StoreProduct) -> Unit,
    onAdd: (StoreProduct) -> Unit
) {
    val packs = products.filter { it.catalogType == "pack" && it.isAvailable }.take(10)
    val offers = products.filter { it.promoActive && it.isAvailable }.take(10)
    val featured = if (offers.isNotEmpty()) offers else packs
    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp)
    ) {
        Column(Modifier.padding(horizontal = 18.dp)) {
            Spacer(Modifier.height(4.dp))
            Text("Bienvenue chez SAMA-PACK", color = BrandGreen, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelLarge)
            Spacer(Modifier.height(5.dp))
            Text("L’entretien simplifié,\nlivré chez vous.", color = Ink, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.ExtraBold)
            Spacer(Modifier.height(14.dp))
            Card(
                shape = RoundedCornerShape(26.dp),
                colors = CardDefaults.cardColors(containerColor = BrandGreen)
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Brush.linearGradient(listOf(BrandGreen, BrandGreenDark)))
                        .padding(20.dp)
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            AssistChip(
                                onClick = {},
                                label = { Text("Dakar • Livraison à domicile", color = Color.White) },
                                leadingIcon = { Icon(Icons.Default.LocalShipping, contentDescription = null, tint = Color.White) },
                                colors = androidx.compose.material3.AssistChipDefaults.assistChipColors(
                                    containerColor = Color.White.copy(alpha = 0.15f)
                                )
                            )
                        }
                        Text("Des produits utiles.\nDes packs prêts à l’emploi.", color = Color.White, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                        Text("Produits de nettoyage, outils et packs d’hygiène sélectionnés pour votre quotidien.", color = Color.White.copy(alpha = 0.85f), style = MaterialTheme.typography.bodyMedium)
                        Button(
                            onClick = onOpenCatalog,
                            colors = ButtonDefaults.buttonColors(containerColor = Color.White, contentColor = BrandGreen)
                        ) {
                            Text("Explorer le catalogue", fontWeight = FontWeight.Bold)
                            Spacer(Modifier.width(8.dp))
                            Icon(Icons.Default.ArrowForward, contentDescription = null)
                        }
                    }
                }
            }
        }

        Column(verticalArrangement = Arrangement.spacedBy(11.dp)) {
            SectionTitle("Choisir une catégorie", "Tout votre essentiel au même endroit")
            LazyRow(
                contentPadding = PaddingValues(horizontal = 18.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                item { CategoryTile("Packs", "Solutions prêtes", Icons.Default.Inventory2, onOpenCatalog) }
                item { CategoryTile("Nettoyage", "Produits ménagers", Icons.Default.ShoppingBag, onOpenCatalog) }
                item { CategoryTile("Outils", "Accessoires pratiques", Icons.Default.CheckCircle, onOpenCatalog) }
            }
        }

        Column(verticalArrangement = Arrangement.spacedBy(11.dp)) {
            SectionTitle(
                if (offers.isNotEmpty()) "Offres à découvrir" else "Nos packs du moment",
                "Des sélections utiles pour la maison"
            )
            if (loading && featured.isEmpty()) {
                LoadingInline()
            } else if (featured.isEmpty()) {
                EmptyState("Le catalogue arrive bientôt", "Revenez dans quelques instants.")
            } else {
                LazyRow(
                    contentPadding = PaddingValues(horizontal = 18.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(featured, key = { it.id }) { product ->
                        ProductCard(
                            product = product,
                            modifier = Modifier.width(205.dp),
                            onOpen = { onOpenProduct(product) },
                            onAdd = { onAdd(product) }
                        )
                    }
                }
            }
        }

        Card(
            modifier = Modifier.padding(horizontal = 18.dp),
            shape = RoundedCornerShape(22.dp),
            colors = CardDefaults.cardColors(containerColor = Warm)
        ) {
            Row(
                Modifier.fillMaxWidth().padding(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    Modifier.size(46.dp).clip(CircleShape).background(Color.White),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(Icons.Default.LocalShipping, contentDescription = null, tint = BrandGreen, modifier = Modifier.size(25.dp))
                }
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text("Livraison à Dakar", fontWeight = FontWeight.Bold, color = Ink)
                    Text("Frais indicatifs : ${formatMoney(deliveryFee)}", color = Muted, style = MaterialTheme.typography.bodySmall)
                }
                Icon(Icons.Default.ChevronRight, contentDescription = null, tint = BrandGreen)
            }
        }
    }
}

@Composable
private fun CategoryTile(
    title: String,
    subtitle: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier.width(155.dp).clickable(onClick = onClick),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White)
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
            Box(Modifier.size(39.dp).clip(RoundedCornerShape(13.dp)).background(SoftGreen), contentAlignment = Alignment.Center) {
                Icon(icon, contentDescription = null, tint = BrandGreen)
            }
            Text(title, fontWeight = FontWeight.Bold, color = Ink)
            Text(subtitle, color = Muted, style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun CatalogScreen(
    products: List<StoreProduct>,
    loading: Boolean,
    onOpenProduct: (StoreProduct) -> Unit,
    onAdd: (StoreProduct) -> Unit
) {
    var search by rememberSaveable { mutableStateOf("") }
    var filter by rememberSaveable { mutableStateOf("all") }
    val filterOptions = listOf(
        "all" to "Tout",
        "pack" to "Packs",
        "product" to "Produits",
        "tool" to "Outils"
    )
    val filtered = products.filter { product ->
        val matchesFilter = filter == "all" || product.catalogType == filter
        val matchesSearch = search.isBlank() ||
            product.name.contains(search, ignoreCase = true) ||
            product.brand.orEmpty().contains(search, ignoreCase = true)
        matchesFilter && matchesSearch
    }

    Column(Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
        Spacer(Modifier.height(8.dp))
        Text("Le catalogue", style = MaterialTheme.typography.headlineSmall, color = Ink, fontWeight = FontWeight.ExtraBold)
        Text("Packs, produits et outils de nettoyage", color = Muted, style = MaterialTheme.typography.bodyMedium)
        Spacer(Modifier.height(14.dp))
        OutlinedTextField(
            value = search,
            onValueChange = { search = it },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            placeholder = { Text("Rechercher un produit…") },
            leadingIcon = { Icon(Icons.Default.Search, contentDescription = null, tint = Muted) },
            shape = RoundedCornerShape(16.dp)
        )
        Spacer(Modifier.height(11.dp))
        Row(
            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            filterOptions.forEach { (key, label) ->
                FilterChip(
                    selected = filter == key,
                    onClick = { filter = key },
                    label = { Text(label) }
                )
            }
        }
        Spacer(Modifier.height(12.dp))
        if (loading && products.isEmpty()) {
            LoadingInline()
        } else if (filtered.isEmpty()) {
            EmptyState("Aucun résultat", "Modifiez votre recherche ou choisissez une autre catégorie.")
        } else {
            Text("${filtered.size} article(s)", color = Muted, style = MaterialTheme.typography.labelMedium)
            Spacer(Modifier.height(8.dp))
            LazyVerticalGrid(
                columns = GridCells.Fixed(2),
                modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(bottom = 18.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                items(filtered, key = { it.id }) { product ->
                    ProductCard(
                        product = product,
                        modifier = Modifier.fillMaxWidth(),
                        onOpen = { onOpenProduct(product) },
                        onAdd = { onAdd(product) }
                    )
                }
            }
        }
    }
}

@Composable
private fun ProductCard(
    product: StoreProduct,
    modifier: Modifier = Modifier,
    onOpen: () -> Unit,
    onAdd: () -> Unit
) {
    Card(
        modifier = modifier.clickable(onClick = onOpen),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column {
            Box {
                AsyncImage(
                    model = product.imageUrl,
                    contentDescription = product.name,
                    modifier = Modifier.fillMaxWidth().aspectRatio(1.08f).background(Color(0xFFF0F3EF)),
                    contentScale = ContentScale.Crop
                )
                if (product.promoActive && product.promoPrice != null && product.promoPrice < product.price) {
                    Surface(
                        modifier = Modifier.align(Alignment.TopStart).padding(8.dp),
                        color = Color(0xFFFCE9D5),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text("PROMO", modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp), color = Color(0xFF9A4D12), style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                    }
                }
                if (!product.isAvailable) {
                    Surface(
                        modifier = Modifier.align(Alignment.TopEnd).padding(8.dp),
                        color = Color(0xFF333D35),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text("Rupture", modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp), color = Color.White, style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
            Column(Modifier.padding(11.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                Text(
                    product.name,
                    color = Ink,
                    fontWeight = FontWeight.SemiBold,
                    style = MaterialTheme.typography.bodyMedium,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    minLines = 2
                )
                Text(
                    saleUnitLabel(product.saleUnit),
                    color = Muted,
                    style = MaterialTheme.typography.labelSmall
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(formatMoney(product.effectivePrice), color = BrandGreen, fontWeight = FontWeight.ExtraBold, style = MaterialTheme.typography.titleSmall)
                        if (product.effectivePrice < product.price) {
                            Text(formatMoney(product.price), color = Muted, style = MaterialTheme.typography.labelSmall)
                        }
                    }
                    IconButton(onClick = onAdd, enabled = product.isAvailable, modifier = Modifier.size(37.dp)) {
                        Icon(Icons.Default.Add, contentDescription = "Ajouter au panier", tint = if (product.isAvailable) BrandGreen else Muted)
                    }
                }
            }
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
                modifier = Modifier.fillMaxWidth().height(250.dp).clip(RoundedCornerShape(22.dp)).background(Color(0xFFF0F3EF)),
                contentScale = ContentScale.Fit
            )
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
