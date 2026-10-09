plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val buildNumber = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()

android {
    namespace = "uz.efir.tv"
    compileSdk = 35

    defaultConfig {
        applicationId = "uz.efir.tv"
        minSdk = 21
        targetSdk = 34
        versionCode = buildNumber
        versionName = "1.0.$buildNumber"
    }

    // Отдельный ключ только для этого приложения: каждая новая сборка
    // ставится поверх старой, избранное и плейлист сохраняются.
    signingConfigs {
        create("efir") {
            storeFile = rootProject.file("signing/efir.keystore")
            storeType = "PKCS12"
            storePassword = "efir-tv-signing"
            keyAlias = "efir"
            keyPassword = "efir-tv-signing"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("efir")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        viewBinding = true
        buildConfig = false
    }

    lint {
        abortOnError = false
        checkReleaseBuilds = false
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.recyclerview:recyclerview:1.3.2")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.6")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")

    implementation("androidx.media3:media3-exoplayer:1.4.1")
    implementation("androidx.media3:media3-exoplayer-hls:1.4.1")
    implementation("androidx.media3:media3-datasource:1.4.1")
    implementation("androidx.media3:media3-ui:1.4.1")

    implementation("io.coil-kt:coil:2.7.0")
    implementation("com.google.zxing:core:3.5.3")

    testImplementation("junit:junit:4.13.2")
}
