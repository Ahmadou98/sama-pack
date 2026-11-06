plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

val supabaseUrl = "https://tbxxrnhcfuaeaatlrdtr.supabase.co"
val supabasePublishableKey = "sb_publishable_lDAKRHFWyUYZ-tb23hbbnQ_96zF9Iwo"
val signingStore = System.getenv("SAMA_ANDROID_KEYSTORE_PATH")
val signingStorePassword = System.getenv("SAMA_ANDROID_KEYSTORE_PASSWORD")
val signingKeyPassword = System.getenv("SAMA_ANDROID_KEY_PASSWORD")

android {
    namespace = "sn.samapack.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "sn.samapack.app"
        minSdk = 26
        targetSdk = 36
        versionCode = 3
        versionName = "1.2.0"
        buildConfigField("String", "SUPABASE_URL", "\"$supabaseUrl\"")
        buildConfigField("String", "SUPABASE_PUBLISHABLE_KEY", "\"$supabasePublishableKey\"")
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    signingConfigs {
        if (!signingStore.isNullOrBlank() && !signingStorePassword.isNullOrBlank() && !signingKeyPassword.isNullOrBlank()) {
            create("release") {
                storeFile = file(signingStore)
                storePassword = signingStorePassword
                keyAlias = "samapack"
                keyPassword = signingKeyPassword
            }
        }
    }

    buildTypes {
        getByName("debug") {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
        getByName("release") {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            if (signingConfigs.findByName("release") != null) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    packaging {
        resources {
            excludes += setOf(
                "META-INF/AL2.0",
                "META-INF/LGPL2.1",
                "META-INF/DEPENDENCIES"
            )
        }
    }
}

// AndroidX Lifecycle 2.11.0 was built with compileSdk 37. Keep the
// Compose runtime bridge on 2.10.0 so this app remains buildable on the
// stable Android SDK 36; the app does not use Lifecycle 2.11-only APIs.
configurations.configureEach {
    resolutionStrategy.force("androidx.lifecycle:lifecycle-runtime-compose:2.10.0")
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2025.12.00"))
    implementation("androidx.activity:activity-compose:1.12.1")
    implementation("androidx.core:core-ktx:1.17.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.10.0")

    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    debugImplementation("androidx.compose.ui:ui-tooling")

    implementation(platform("io.github.jan-tennert.supabase:bom:3.9.0"))
    implementation("io.github.jan-tennert.supabase:auth-kt")
    implementation("io.github.jan-tennert.supabase:postgrest-kt")
    implementation("io.github.jan-tennert.supabase:functions-kt")
    implementation("io.ktor:ktor-client-android:3.4.3")

    implementation("io.coil-kt.coil3:coil-compose:3.5.0")
    implementation("io.coil-kt.coil3:coil-network-okhttp:3.5.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
}
