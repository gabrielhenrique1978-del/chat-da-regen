from typing import Any, Dict, List, Optional

from core.db import Database, Message, WorkflowRule


class WorkflowEngine:
    """
    Motor de automação declarativo.
    Avalia regras de gatilho (keyword, tag, stage_change) e executa sequências
    de ações (add_tag, send_message, move_stage).
    """

    def __init__(self, db: Database):
        self.db = db

    def evaluate(
        self,
        contact_id: str,
        event_type: str,
        event_value: str,
        channel: str = "whatsapp",
    ) -> List[Dict[str, Any]]:
        """
        Avalia todas as regras ativas para o evento informado e executa suas ações.
        Retorna a lista de ações disparadas.
        """
        rules = self.db.list_workflow_rules(only_active=True)
        executed_actions: List[Dict[str, Any]] = []
        normalized_event_val = (event_value or "").strip().lower()

        for rule in rules:
            if rule.trigger_type != event_type:
                continue

            if self._matches(rule, normalized_event_val):
                for action in rule.actions:
                    result = self._execute_action(contact_id, rule, action, channel)
                    if result:
                        executed_actions.append(result)

        return executed_actions

    def _matches(self, rule: WorkflowRule, normalized_event_val: str) -> bool:
        triggers = [t.strip().lower() for t in rule.trigger_value.split(",") if t.strip()]
        if not triggers:
            return False

        if rule.trigger_type == "keyword":
            return any(t in normalized_event_val for t in triggers)
        elif rule.trigger_type in ("tag", "stage_change"):
            return any(t == normalized_event_val or t in normalized_event_val for t in triggers)
        return False

    def _execute_action(
        self,
        contact_id: str,
        rule: WorkflowRule,
        action: Dict[str, Any],
        channel: str,
    ) -> Optional[Dict[str, Any]]:
        action_type = action.get("type")
        action_val = action.get("value", "")

        if action_type == "add_tag" and action_val:
            updated_contact = self.db.add_contact_tag(contact_id, action_val)
            return {
                "rule_id": rule.id,
                "rule_name": rule.name,
                "action_type": "add_tag",
                "value": action_val,
                "tags": updated_contact.tags if updated_contact else [],
            }

        elif action_type == "send_message" and action_val:
            msg = self.db.create_message(
                Message(
                    contact_id=contact_id,
                    sender="system",
                    channel=channel,
                    content=action_val,
                )
            )
            return {
                "rule_id": rule.id,
                "rule_name": rule.name,
                "action_type": "send_message",
                "value": action_val,
                "message_id": msg.id,
            }

        elif action_type == "move_stage" and action_val:
            deal = self.db.get_contact_active_deal(contact_id)
            if deal:
                moved = self.db.move_deal_stage(deal.id, action_val)
                if moved:
                    return {
                        "rule_id": rule.id,
                        "rule_name": rule.name,
                        "action_type": "move_stage",
                        "value": action_val,
                        "deal_id": moved.id,
                        "stage_id": moved.stage_id,
                    }

        return None
