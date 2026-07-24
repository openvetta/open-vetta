package org.vetta.android.ui.sessions

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import org.vetta.android.domain.session.ChatSession
import org.vetta.android.ui.i18n.Str
import org.vetta.android.ui.icons.VettaIcons

@Composable
fun SessionsDrawerContent(
    sessions: List<ChatSession>,
    currentSessionId: String?,
    query: String,
    onQueryChange: (String) -> Unit,
    onNewChat: () -> Unit,
    onOpenSession: (String) -> Unit,
    onDeleteSession: (String) -> Unit,
    onRenameSession: (String, String) -> Unit,
) {
    var pendingDelete by remember { mutableStateOf<ChatSession?>(null) }
    var pendingRename by remember { mutableStateOf<ChatSession?>(null) }
    var renameText by remember { mutableStateOf("") }

    val filtered =
        remember(sessions, query) {
            val q = query.trim()
            if (q.isEmpty()) {
                sessions
            } else {
                sessions.filter { it.title.contains(q, ignoreCase = true) }
            }
        }

    ModalDrawerSheet(modifier = Modifier.width(320.dp)) {
        Column(
            Modifier
                .fillMaxHeight()
                .padding(16.dp),
        ) {
            Text(Str.sessions, style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(12.dp))
            Button(onClick = onNewChat, modifier = Modifier.fillMaxWidth()) {
                Icon(VettaIcons.Add, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text(Str.newChat)
            }
            Spacer(Modifier.height(12.dp))
            TextField(
                value = query,
                onValueChange = onQueryChange,
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                placeholder = { Text(Str.searchSessions) },
            )
            Spacer(Modifier.height(8.dp))
            HorizontalDivider()
            if (filtered.isEmpty()) {
                Text(
                    Str.noSessions,
                    modifier = Modifier.padding(vertical = 24.dp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    items(filtered, key = { it.id }) { session ->
                        SessionRow(
                            session = session,
                            selected = session.id == currentSessionId,
                            onClick = { onOpenSession(session.id) },
                            onDelete = { pendingDelete = session },
                            onRename = {
                                pendingRename = session
                                renameText = session.title
                            },
                        )
                    }
                }
            }
        }
    }

    pendingDelete?.let { session ->
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            title = { Text(Str.delete) },
            text = { Text(Str.deleteSessionConfirm) },
            confirmButton = {
                TextButton(
                    onClick = {
                        onDeleteSession(session.id)
                        pendingDelete = null
                    },
                ) { Text(Str.delete) }
            },
            dismissButton = {
                TextButton(onClick = { pendingDelete = null }) { Text(Str.cancel) }
            },
        )
    }

    pendingRename?.let { session ->
        AlertDialog(
            onDismissRequest = { pendingRename = null },
            title = { Text(Str.rename) },
            text = {
                TextField(
                    value = renameText,
                    onValueChange = { renameText = it },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        onRenameSession(session.id, renameText)
                        pendingRename = null
                    },
                ) { Text(Str.save) }
            },
            dismissButton = {
                TextButton(onClick = { pendingRename = null }) { Text(Str.cancel) }
            },
        )
    }
}

@Composable
private fun SessionRow(
    session: ChatSession,
    selected: Boolean,
    onClick: () -> Unit,
    onDelete: () -> Unit,
    onRename: () -> Unit,
) {
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .clickable(onClick = onClick)
                .padding(vertical = 8.dp, horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                session.title,
                style = MaterialTheme.typography.bodyLarge,
                color =
                    if (selected) {
                        MaterialTheme.colorScheme.primary
                    } else {
                        MaterialTheme.colorScheme.onSurface
                    },
                maxLines = 1,
            )
            if (!session.modelName.isNullOrBlank()) {
                Text(
                    session.modelName,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                )
            }
        }
        TextButton(onClick = onRename) { Text(Str.rename) }
        IconButton(onClick = onDelete) {
            Icon(VettaIcons.Delete, contentDescription = Str.delete)
        }
    }
}
