package org.vetta.android

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.tooling.preview.Preview
import org.vetta.android.app.AppContainer
import org.vetta.android.ui.RootApp

@Composable
@Preview
fun App() {
    val container = remember { AppContainer.createDefault() }
    RootApp(container)
}
