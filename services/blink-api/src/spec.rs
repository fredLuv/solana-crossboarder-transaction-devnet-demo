use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
pub struct ActionsJson {
    pub rules: Vec<ActionRule>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionRule {
    pub path_pattern: String,
    pub api_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionGetResponse {
    #[allow(dead_code)]
    #[serde(rename = "type", skip_serializing, default = "default_action_type")]
    action_type: String,
    pub icon: String,
    pub title: String,
    pub description: String,
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub links: Option<ActionLinks>,
}

fn default_action_type() -> String {
    "action".into()
}

impl ActionGetResponse {
    pub fn new(icon: &str, title: &str, description: &str, label: &str) -> Self {
        Self {
            action_type: "action".into(),
            icon: icon.into(),
            title: title.into(),
            description: description.into(),
            label: label.into(),
            links: None,
        }
    }

    pub fn with_links(mut self, actions: Vec<LinkedAction>) -> Self {
        self.links = Some(ActionLinks { actions });
        self
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionLinks {
    pub actions: Vec<LinkedAction>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinkedAction {
    pub href: String,
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parameters: Option<Vec<ActionParameter>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionParameter {
    pub name: String,
    pub label: Option<String>,
    pub required: Option<bool>,
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    pub parameter_type: Option<ActionParameterType>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min: Option<f64>,
}

impl ActionParameter {
    pub fn text(name: &str, label: &str, required: bool) -> Self {
        Self {
            name: name.into(),
            label: Some(label.into()),
            required: Some(required),
            parameter_type: Some(ActionParameterType::Text),
            min: None,
        }
    }

    pub fn number(name: &str, label: &str, required: bool) -> Self {
        Self {
            parameter_type: Some(ActionParameterType::Number),
            ..Self::text(name, label, required)
        }
    }

    pub fn with_min(mut self, min: f64) -> Self {
        self.min = Some(min);
        self
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ActionParameterType {
    Text,
    Number,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionPostRequest {
    pub account: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionPostResponse {
    pub transaction: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}
