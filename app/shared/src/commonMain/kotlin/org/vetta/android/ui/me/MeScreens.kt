package org.vetta.android.ui.me

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import org.vetta.android.core.model.SubscriptionStatus
import org.vetta.android.core.model.User
import org.vetta.android.ui.components.QuotaMeter
import org.vetta.android.ui.i18n.Str
import org.vetta.android.ui.icons.VettaIcons

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MeScreen(
    user: User?,
    subscription: SubscriptionStatus?,
    onBack: () -> Unit,
    onOpenPlan: () -> Unit,
    onOpenSettings: () -> Unit,
    onLogout: (clearLocal: Boolean) -> Unit,
) {
    var confirmLogout by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(Str.me) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(VettaIcons.Back, contentDescription = Str.back)
                    }
                },
            )
        },
    ) { padding ->
        Column(
            Modifier
                .padding(padding)
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(20.dp),
        ) {
            Text(
                user?.nickname?.ifBlank { user.username } ?: "—",
                style = MaterialTheme.typography.headlineSmall,
            )
            val contact = user?.email ?: user?.phone
            if (!contact.isNullOrBlank()) {
                Spacer(Modifier.height(4.dp))
                Text(
                    contact,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(Modifier.height(20.dp))
            Card(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .clickable(onClick = onOpenPlan),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
            ) {
                Column(Modifier.padding(16.dp)) {
                    Text(Str.plan, style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(6.dp))
                    Text(
                        planSummary(subscription),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    subscription?.windows?.firstOrNull()?.let { w ->
                        Spacer(Modifier.height(10.dp))
                        QuotaMeter(
                            label = windowLabel(w.kind),
                            limit = w.limit,
                            consumed = w.consumed,
                            resetAt = w.resetAt,
                        )
                    }
                }
            }
            Spacer(Modifier.height(12.dp))
            OutlinedButton(onClick = onOpenSettings, modifier = Modifier.fillMaxWidth()) {
                Text(Str.settings)
            }
            Spacer(Modifier.height(12.dp))
            Button(onClick = { confirmLogout = true }, modifier = Modifier.fillMaxWidth()) {
                Text(Str.logout)
            }
        }
    }

    if (confirmLogout) {
        AlertDialog(
            onDismissRequest = { confirmLogout = false },
            title = { Text(Str.logout) },
            text = { Text(Str.logoutConfirm) },
            // 主操作：退出并保留本机对话
            confirmButton = {
                Button(
                    onClick = {
                        confirmLogout = false
                        onLogout(false)
                    },
                ) { Text(Str.logout) }
            },
            // 次操作：退出并清除本机对话；另提供取消
            dismissButton = {
                Column {
                    TextButton(
                        onClick = {
                            confirmLogout = false
                            onLogout(true)
                        },
                    ) { Text(Str.logoutAndClear) }
                    TextButton(onClick = { confirmLogout = false }) { Text(Str.cancel) }
                }
            },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlanScreen(
    subscription: SubscriptionStatus?,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(Str.plan) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(VettaIcons.Back, contentDescription = Str.back)
                    }
                },
                actions = {
                    TextButton(onClick = onRefresh) { Text(Str.actionRetry) }
                },
            )
        },
    ) { padding ->
        Column(
            Modifier
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(20.dp),
        ) {
            Text(planSummary(subscription), style = MaterialTheme.typography.titleMedium)
            if (subscription?.tierName != null) {
                Spacer(Modifier.height(4.dp))
                Text(
                    subscription.tierName + if (subscription.isDefault) " · ${Str.planDefault}" else "",
                    style = MaterialTheme.typography.bodyLarge,
                )
            }
            if (!subscription?.description.isNullOrBlank()) {
                Spacer(Modifier.height(8.dp))
                Text(
                    subscription.description.orEmpty(),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(Modifier.height(20.dp))
            subscription?.windows.orEmpty().forEach { w ->
                QuotaMeter(
                    label = windowLabel(w.kind),
                    limit = w.limit,
                    consumed = w.consumed,
                    resetAt = w.resetAt,
                    modifier = Modifier.padding(vertical = 10.dp),
                )
            }
            if (subscription?.windows.isNullOrEmpty()) {
                Text(
                    "当前没有可展示的额度窗口",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

private fun planSummary(sub: SubscriptionStatus?): String =
    when {
        sub == null -> Str.loading
        !sub.goEnabled -> Str.planDisabled
        !sub.active -> Str.planInactive
        else -> Str.planActive
    }

private fun windowLabel(kind: String): String =
    when (kind) {
        "5h" -> Str.window5h
        "week" -> Str.windowWeek
        "month" -> Str.windowMonth
        else -> kind
    }
