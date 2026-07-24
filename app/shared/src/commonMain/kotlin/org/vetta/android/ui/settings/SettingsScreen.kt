package org.vetta.android.ui.settings

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import org.vetta.android.app.ThemeMode
import org.vetta.android.ui.i18n.Str

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    themeMode: ThemeMode,
    serverUrl: String,
    onThemeMode: (ThemeMode) -> Unit,
    onOpenServer: () -> Unit,
    onBack: () -> Unit,
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(Str.settings) },
                navigationIcon = {
                    TextButton(onClick = onBack) { Text(Str.back) }
                },
            )
        },
    ) { padding ->
        Column(
            Modifier
                .padding(padding)
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(vertical = 8.dp),
        ) {
            Text(
                Str.appearance,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.primary,
            )
            ThemeMode.entries.forEach { mode ->
                val label =
                    when (mode) {
                        ThemeMode.System -> Str.themeSystem
                        ThemeMode.Light -> Str.themeLight
                        ThemeMode.Dark -> Str.themeDark
                    }
                ListItem(
                    headlineContent = { Text(label) },
                    leadingContent = {
                        RadioButton(selected = themeMode == mode, onClick = null)
                    },
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .selectable(
                                selected = themeMode == mode,
                                onClick = { onThemeMode(mode) },
                                role = Role.RadioButton,
                            ),
                )
            }
            HorizontalDivider(Modifier.padding(vertical = 8.dp))
            Text(
                Str.server,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.primary,
            )
            ListItem(
                headlineContent = { Text(Str.serverUrl) },
                supportingContent = { Text(serverUrl) },
                modifier = Modifier.fillMaxWidth().selectable(selected = false, onClick = onOpenServer),
            )
            HorizontalDivider(Modifier.padding(vertical = 8.dp))
            Text(
                Str.about,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.primary,
            )
            ListItem(
                headlineContent = { Text(Str.appName) },
                supportingContent = { Text("${Str.version} 0.1.0") },
            )
            Spacer(Modifier.height(24.dp))
        }
    }
}
