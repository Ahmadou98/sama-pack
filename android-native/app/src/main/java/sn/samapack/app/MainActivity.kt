package sn.samapack.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.lifecycle.ViewModelProvider
import sn.samapack.app.ui.SamaPackApp
import sn.samapack.app.ui.SamaPackViewModel

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val appViewModel = ViewModelProvider(this)[SamaPackViewModel::class.java]
        setContent {
            SamaPackApp(appViewModel)
        }
    }
}
