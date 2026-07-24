package org.vetta.android.ui.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeContentPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import org.vetta.android.domain.error.UiError
import org.vetta.android.ui.components.VettaErrorBanner
import org.vetta.android.ui.i18n.Str

@Composable
fun WelcomeScreen(
    onLogin: () -> Unit,
    onServerSetup: () -> Unit,
) {
    Column(
        modifier =
            Modifier
                .fillMaxSize()
                .safeContentPadding()
                .padding(horizontal = 24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.Start,
    ) {
        Text(Str.appName, style = MaterialTheme.typography.headlineLarge)
        Spacer(Modifier.height(12.dp))
        Text(Str.welcomeTitle, style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(8.dp))
        Text(
            Str.welcomeSubtitle,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(32.dp))
        Button(onClick = onLogin, modifier = Modifier.fillMaxWidth()) {
            Text(Str.getStarted)
        }
        TextButton(onClick = onServerSetup, modifier = Modifier.align(Alignment.End)) {
            Text(Str.advancedServer)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LoginScreen(
    loading: Boolean,
    error: UiError?,
    loginModeEmail: Boolean,
    passwordVisible: Boolean,
    serverUrl: String,
    onToggleMode: (Boolean) -> Unit,
    onTogglePassword: (Boolean) -> Unit,
    onLogin: (account: String, password: String) -> Unit,
    onServerSetup: () -> Unit,
    onClearError: () -> Unit,
    onBack: () -> Unit,
) {
    var account by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(Str.loginTitle) },
                navigationIcon = {
                    TextButton(onClick = onBack) { Text(Str.back) }
                },
            )
        },
    ) { padding ->
        Column(
            modifier =
                Modifier
                    .padding(padding)
                    .fillMaxSize()
                    .imePadding()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 24.dp, vertical = 12.dp),
        ) {
            Text(
                Str.loginSubtitle,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(8.dp))
            Text(
                "${Str.serverHint}：$serverUrl",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(16.dp))
            if (error != null) {
                VettaErrorBanner(error = error, onDismiss = onClearError)
                Spacer(Modifier.height(12.dp))
            }
            OutlinedTextField(
                value = account,
                onValueChange = { account = it },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                label = { Text(if (loginModeEmail) Str.email else Str.account) },
                keyboardOptions =
                    KeyboardOptions(
                        keyboardType = if (loginModeEmail) KeyboardType.Email else KeyboardType.Text,
                        imeAction = ImeAction.Next,
                    ),
            )
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = password,
                onValueChange = { password = it },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                label = { Text(Str.password) },
                visualTransformation =
                    if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                trailingIcon = {
                    TextButton(onClick = { onTogglePassword(!passwordVisible) }) {
                        Text(if (passwordVisible) Str.hidePassword else Str.showPassword)
                    }
                },
                keyboardOptions =
                    KeyboardOptions(
                        keyboardType = KeyboardType.Password,
                        imeAction = ImeAction.Done,
                    ),
                keyboardActions =
                    KeyboardActions(
                        onDone = {
                            if (!loading && account.isNotBlank() && password.isNotBlank()) {
                                onLogin(account.trim(), password)
                            }
                        },
                    ),
            )
            Spacer(Modifier.height(20.dp))
            Button(
                onClick = { onLogin(account.trim(), password) },
                enabled = !loading && account.isNotBlank() && password.isNotBlank(),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(if (loading) Str.loggingIn else Str.loginAction)
            }
            TextButton(
                onClick = { onToggleMode(!loginModeEmail) },
                modifier = Modifier.align(Alignment.End),
            ) {
                Text(if (loginModeEmail) Str.useAccountLogin else Str.useEmailLogin)
            }
            TextButton(
                onClick = onServerSetup,
                modifier = Modifier.align(Alignment.End),
            ) {
                Text(Str.advancedServer)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ServerSetupScreen(
    serverUrl: String,
    onSave: (String) -> Unit,
    onBack: () -> Unit,
) {
    var value by remember(serverUrl) { mutableStateOf(serverUrl) }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(Str.server) },
                navigationIcon = {
                    TextButton(onClick = onBack) { Text(Str.back) }
                },
            )
        },
    ) { padding ->
        Column(
            Modifier
                .padding(padding)
                .padding(24.dp)
                .fillMaxSize(),
        ) {
            Text(
                Str.serverUrlHint,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = value,
                onValueChange = { value = it },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                label = { Text(Str.serverUrl) },
            )
            Spacer(Modifier.height(20.dp))
            Button(
                onClick = { onSave(value) },
                enabled = value.isNotBlank(),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(Str.save)
            }
        }
    }
}
