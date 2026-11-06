# Supabase/Kotlin serialization models use generated serializers.
-keepattributes *Annotation*, InnerClasses, EnclosingMethod
-keep class kotlinx.serialization.** { *; }
-keepclassmembers class **$$serializer { *; }
-keepclasseswithmembers class ** {
    kotlinx.serialization.KSerializer serializer(...);
}

-keep class sn.samapack.app.data.** { *; }
