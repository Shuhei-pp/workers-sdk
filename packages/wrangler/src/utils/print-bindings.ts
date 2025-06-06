import chalk from "chalk";
import { getFlag } from "../experimental-flags";
import { logger } from "../logger";
import type { CfTailConsumer, CfWorkerInit } from "../deployment-bundle/worker";
import type { WorkerRegistry } from "../dev-registry";

export const friendlyBindingNames: Record<
	keyof CfWorkerInit["bindings"],
	string
> = {
	data_blobs: "Data Blobs",
	durable_objects: "Durable Objects",
	kv_namespaces: "KV Namespaces",
	send_email: "Send Email",
	queues: "Queues",
	d1_databases: "D1 Databases",
	vectorize: "Vectorize Indexes",
	hyperdrive: "Hyperdrive Configs",
	r2_buckets: "R2 Buckets",
	logfwdr: "logfwdr",
	services: "Services",
	analytics_engine_datasets: "Analytics Engine Datasets",
	text_blobs: "Text Blobs",
	browser: "Browser",
	ai: "AI",
	images: "Images",
	version_metadata: "Worker Version Metadata",
	unsafe: "Unsafe Metadata",
	vars: "Vars",
	wasm_modules: "Wasm Modules",
	dispatch_namespaces: "Dispatch Namespaces",
	mtls_certificates: "mTLS Certificates",
	workflows: "Workflows",
	pipelines: "Pipelines",
	secrets_store_secrets: "Secrets Store Secrets",
	assets: "Assets",
} as const;

/**
 * Print all the bindings a worker using a given config would have access to
 */
export function printBindings(
	bindings: Partial<CfWorkerInit["bindings"]>,
	tailConsumers: CfTailConsumer[] = [],
	context: {
		registry?: WorkerRegistry | null;
		local?: boolean;
		imagesLocalMode?: boolean;
		name?: string;
		provisioning?: boolean;
	} = {}
) {
	let hasConnectionStatus = false;
	const addSuffix = createAddSuffix({
		isProvisioning: context.provisioning,
		isLocalDev: context.local,
	});
	const truncate = (item: string | Record<string, unknown>) => {
		const s = typeof item === "string" ? item : JSON.stringify(item);
		const maxLength = 40;
		if (s.length < maxLength) {
			return s;
		}

		return `${s.substring(0, maxLength - 3)}...`;
	};

	const output: {
		name: string;
		entries: { key: string; value: string | boolean }[];
	}[] = [];

	const {
		data_blobs,
		durable_objects,
		workflows,
		kv_namespaces,
		send_email,
		queues,
		d1_databases,
		vectorize,
		hyperdrive,
		r2_buckets,
		logfwdr,
		secrets_store_secrets,
		services,
		analytics_engine_datasets,
		text_blobs,
		browser,
		images,
		ai,
		version_metadata,
		unsafe,
		vars,
		wasm_modules,
		dispatch_namespaces,
		mtls_certificates,
		pipelines,
		assets,
	} = bindings;

	if (data_blobs !== undefined && Object.keys(data_blobs).length > 0) {
		output.push({
			name: friendlyBindingNames.data_blobs,
			entries: Object.entries(data_blobs).map(([key, value]) => ({
				key,
				value: typeof value === "string" ? truncate(value) : "<Buffer>",
			})),
		});
	}

	if (durable_objects !== undefined && durable_objects.bindings.length > 0) {
		output.push({
			name: friendlyBindingNames.durable_objects,
			entries: durable_objects.bindings.map(
				({ name, class_name, script_name }) => {
					let value = class_name;
					if (script_name) {
						if (context.local && context.registry !== null) {
							const registryDefinition = context.registry?.[script_name];

							hasConnectionStatus = true;
							if (
								registryDefinition &&
								registryDefinition.durableObjects.some(
									(d) => d.className === class_name
								)
							) {
								value += ` (defined in ${script_name} ${chalk.green("[connected]")})`;
							} else {
								value += ` (defined in ${script_name} ${chalk.red("[not connected]")})`;
							}
						} else {
							value += ` (defined in ${script_name})`;
						}
					}

					return {
						key: name,
						value: value,
					};
				}
			),
		});
	}

	if (workflows !== undefined && workflows.length > 0) {
		output.push({
			name: friendlyBindingNames.workflows,
			entries: workflows.map(({ class_name, script_name, binding, remote }) => {
				let value = class_name;
				if (script_name) {
					value += ` (defined in ${script_name})`;
				}

				return {
					key: binding,
					value: script_name
						? value
						: addSuffix(value, {
								isSimulatedLocally: !remote,
							}),
				};
			}),
		});
	}

	if (kv_namespaces !== undefined && kv_namespaces.length > 0) {
		output.push({
			name: friendlyBindingNames.kv_namespaces,
			entries: kv_namespaces.map(({ binding, id, remote }) => {
				return {
					key: binding,
					value: addSuffix(id, {
						isSimulatedLocally: !remote,
					}),
				};
			}),
		});
	}

	if (send_email !== undefined && send_email.length > 0) {
		output.push({
			name: friendlyBindingNames.send_email,
			entries: send_email.map((emailBinding) => {
				const destination_address =
					"destination_address" in emailBinding
						? emailBinding.destination_address
						: undefined;
				const allowed_destination_addresses =
					"allowed_destination_addresses" in emailBinding
						? emailBinding.allowed_destination_addresses
						: undefined;
				return {
					key: emailBinding.name,
					value: addSuffix(
						destination_address ||
							allowed_destination_addresses?.join(", ") ||
							"unrestricted",
						{ isSimulatedLocally: true }
					),
				};
			}),
		});
	}

	if (queues !== undefined && queues.length > 0) {
		output.push({
			name: friendlyBindingNames.queues,
			entries: queues.map(({ binding, queue_name, remote }) => {
				return {
					key: binding,
					value: addSuffix(queue_name, {
						isSimulatedLocally: !remote,
					}),
				};
			}),
		});
	}

	if (d1_databases !== undefined && d1_databases.length > 0) {
		output.push({
			name: friendlyBindingNames.d1_databases,
			entries: d1_databases.map(
				({
					binding,
					database_name,
					database_id,
					preview_database_id,
					remote,
				}) => {
					const remoteDatabaseId =
						typeof database_id === "string" ? database_id : null;
					let databaseValue =
						remoteDatabaseId && database_name
							? `${database_name} (${remoteDatabaseId})`
							: remoteDatabaseId ?? database_name;

					//database_id is local when running `wrangler dev --local`
					if (preview_database_id && database_id !== "local") {
						databaseValue = `${databaseValue ? `${databaseValue}, ` : ""}Preview: (${preview_database_id})`;
					}
					return {
						key: binding,
						value: addSuffix(databaseValue, {
							isSimulatedLocally: !remote,
						}),
					};
				}
			),
		});
	}

	if (vectorize !== undefined && vectorize.length > 0) {
		output.push({
			name: friendlyBindingNames.vectorize,
			entries: vectorize.map(({ binding, index_name }) => {
				return {
					key: binding,
					value: addSuffix(index_name),
				};
			}),
		});
	}

	if (hyperdrive !== undefined && hyperdrive.length > 0) {
		output.push({
			name: friendlyBindingNames.hyperdrive,
			entries: hyperdrive.map(({ binding, id }) => {
				return {
					key: binding,
					value: addSuffix(id, {
						isSimulatedLocally: true,
					}),
				};
			}),
		});
	}

	if (r2_buckets !== undefined && r2_buckets.length > 0) {
		output.push({
			name: friendlyBindingNames.r2_buckets,
			entries: r2_buckets.map(
				({ binding, bucket_name, jurisdiction, remote }) => {
					let name = typeof bucket_name === "string" ? bucket_name : "";

					if (jurisdiction !== undefined) {
						name += ` (${jurisdiction})`;
					}

					return {
						key: binding,
						value: addSuffix(name, {
							isSimulatedLocally: !remote,
						}),
					};
				}
			),
		});
	}

	if (logfwdr !== undefined && logfwdr.bindings.length > 0) {
		output.push({
			name: friendlyBindingNames.logfwdr,
			entries: logfwdr.bindings.map((binding) => {
				return {
					key: binding.name,
					value: addSuffix(binding.destination),
				};
			}),
		});
	}

	if (secrets_store_secrets !== undefined && secrets_store_secrets.length > 0) {
		output.push({
			name: friendlyBindingNames.secrets_store_secrets,
			entries: secrets_store_secrets.map(
				({ binding, store_id, secret_name }) => {
					return {
						key: binding,
						value: addSuffix(`${store_id}/${secret_name}`, {
							isSimulatedLocally: true,
						}),
					};
				}
			),
		});
	}

	if (services !== undefined && services.length > 0) {
		output.push({
			name: friendlyBindingNames.services,
			entries: services.map(({ binding, service, entrypoint, remote }) => {
				let value = service;
				if (entrypoint) {
					value += `#${entrypoint}`;
				}

				if (remote) {
					value = addSuffix(value, {
						isSimulatedLocally: false,
					});
				} else if (context.local && context.registry !== null) {
					const registryDefinition = context.registry?.[service];
					hasConnectionStatus = true;

					if (
						registryDefinition &&
						(!entrypoint ||
							registryDefinition.entrypointAddresses?.[entrypoint])
					) {
						if (getFlag("MIXED_MODE")) {
							value =
								value + " " + chalk.green(`[connected to local resource]`);
						} else {
							value = value + " " + chalk.green(`[connected]`);
						}
					} else {
						value = value + " " + chalk.red("[not connected]");
					}
				}

				return {
					key: binding,
					value,
				};
			}),
		});
	}

	if (
		analytics_engine_datasets !== undefined &&
		analytics_engine_datasets.length > 0
	) {
		output.push({
			name: friendlyBindingNames.analytics_engine_datasets,
			entries: analytics_engine_datasets.map(({ binding, dataset }) => {
				return {
					key: binding,
					value: addSuffix(dataset ?? binding, {
						isSimulatedLocally: true,
					}),
				};
			}),
		});
	}

	if (text_blobs !== undefined && Object.keys(text_blobs).length > 0) {
		output.push({
			name: friendlyBindingNames.text_blobs,
			entries: Object.entries(text_blobs).map(([key, value]) => ({
				key,
				value: addSuffix(truncate(value)),
			})),
		});
	}

	if (browser !== undefined) {
		output.push({
			name: friendlyBindingNames.browser,
			entries: [{ key: "Name", value: browser.binding }],
		});
	}

	if (images !== undefined) {
		const addImagesSuffix = createAddSuffix({
			isProvisioning: context.provisioning,
			isLocalDev: !!context.imagesLocalMode,
		});
		output.push({
			name: friendlyBindingNames.images,
			entries: [
				{
					key: "Name",
					value: addImagesSuffix(images.binding),
				},
			],
		});
	}

	if (ai !== undefined) {
		const entries: [{ key: string; value: string | boolean }] = [
			{ key: "Name", value: addSuffix(ai.binding) },
		];
		if (ai.staging) {
			entries.push({
				key: "Staging",
				value: addSuffix(ai.staging.toString(), { isSimulatedLocally: false }),
			});
		}

		output.push({
			name: friendlyBindingNames.ai,
			entries: entries,
		});
	}

	if (pipelines?.length) {
		output.push({
			name: friendlyBindingNames.pipelines,
			entries: pipelines.map(({ binding, pipeline }) => ({
				key: binding,
				value: addSuffix(pipeline),
			})),
		});
	}

	if (assets !== undefined) {
		output.push({
			name: friendlyBindingNames.assets,
			entries: [{ key: "Binding", value: assets.binding }],
		});
	}

	if (version_metadata !== undefined) {
		output.push({
			name: friendlyBindingNames.version_metadata,
			entries: [{ key: "Name", value: addSuffix(version_metadata.binding) }],
		});
	}

	if (unsafe?.bindings !== undefined && unsafe.bindings.length > 0) {
		output.push({
			name: friendlyBindingNames.unsafe,
			entries: unsafe.bindings.map(({ name, type }) => ({
				key: type,
				value: addSuffix(name),
			})),
		});
	}

	if (vars !== undefined && Object.keys(vars).length > 0) {
		output.push({
			name: friendlyBindingNames.vars,
			entries: Object.entries(vars).map(([key, value]) => {
				let parsedValue;
				if (typeof value === "string") {
					parsedValue = `"${truncate(value)}"`;
				} else if (typeof value === "object") {
					parsedValue = JSON.stringify(value, null, 1);
				} else {
					parsedValue = `${truncate(`${value}`)}`;
				}
				return {
					key,
					value: parsedValue,
				};
			}),
		});
	}

	if (wasm_modules !== undefined && Object.keys(wasm_modules).length > 0) {
		output.push({
			name: friendlyBindingNames.wasm_modules,
			entries: Object.entries(wasm_modules).map(([key, value]) => ({
				key,
				value: addSuffix(
					typeof value === "string" ? truncate(value) : "<Wasm>"
				),
			})),
		});
	}

	if (dispatch_namespaces !== undefined && dispatch_namespaces.length > 0) {
		output.push({
			name: friendlyBindingNames.dispatch_namespaces,
			entries: dispatch_namespaces.map(({ binding, namespace, outbound }) => {
				return {
					key: binding,
					value: addSuffix(
						outbound
							? `${namespace} (outbound -> ${outbound.service})`
							: namespace
					),
				};
			}),
		});
	}

	if (mtls_certificates !== undefined && mtls_certificates.length > 0) {
		output.push({
			name: friendlyBindingNames.mtls_certificates,
			entries: mtls_certificates.map(({ binding, certificate_id }) => {
				return {
					key: binding,
					value: addSuffix(certificate_id),
				};
			}),
		});
	}

	if (unsafe?.metadata !== undefined) {
		output.push({
			name: friendlyBindingNames.unsafe,
			entries: Object.entries(unsafe.metadata).map(([key, value]) => ({
				key,
				value: addSuffix(JSON.stringify(value)),
			})),
		});
	}

	if (output.length === 0) {
		if (context.name && getFlag("MULTIWORKER")) {
			logger.log(`No bindings found for ${chalk.blue(context.name)}`);
		} else {
			logger.log("No bindings found.");
		}
	} else {
		if (context.local) {
			logger.once.log(
				`Your Worker and resources are simulated locally via Miniflare. For more information, see: https://developers.cloudflare.com/workers/testing/local-development.\n`
			);
		}

		let title: string;
		if (context.provisioning) {
			title = "The following bindings need to be provisioned:";
		} else if (context.name && getFlag("MULTIWORKER")) {
			title = `${chalk.blue(context.name)} has access to the following bindings:`;
		} else {
			title = "Your Worker has access to the following bindings:";
		}

		const message = [
			title,
			...output
				.map((bindingGroup) => {
					return [
						`- ${bindingGroup.name}:`,
						bindingGroup.entries.map(
							({ key, value }) => `  - ${key}${value ? ":" : ""} ${value}`
						),
					];
				})
				.flat(2),
		].join("\n");

		logger.log(message);
	}
	let title: string;
	if (context.name && getFlag("MULTIWORKER")) {
		title = `${chalk.blue(context.name)} is sending Tail events to the following Workers:`;
	} else {
		title = "Your Worker is sending Tail events to the following Workers:";
	}
	if (tailConsumers !== undefined && tailConsumers.length > 0) {
		logger.log(
			`${title}\n${tailConsumers
				.map(({ service }) => {
					if (context.local && context.registry !== null) {
						const registryDefinition = context.registry?.[service];
						hasConnectionStatus = true;

						if (registryDefinition) {
							return `- ${service} ${chalk.green("[connected]")}`;
						} else {
							return `- ${service} ${chalk.red("[not connected]")}`;
						}
					} else {
						return `- ${service}`;
					}
				})
				.join("\n")}`
		);
	}

	if (hasConnectionStatus) {
		logger.once.info(
			`\nService bindings, Durable Object bindings, and Tail consumers connect to other \`wrangler dev\` processes running locally, with their connection status indicated by ${chalk.green("[connected]")} or ${chalk.red("[not connected]")}. For more details, refer to https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/#local-development\n`
		);
	}
}

function normalizeValue(value: string | symbol | undefined) {
	if (!value || typeof value === "symbol") {
		return "";
	}

	return value;
}

/**
 * Creates a function for adding a suffix to the value of a binding in the console.
 *
 * The suffix is only for local dev so it can be used to determine whether a binding is
 * simulated locally or connected to a remote resource.
 */
function createAddSuffix({
	isProvisioning = false,
	isLocalDev = false,
}: {
	isProvisioning?: boolean;
	isLocalDev?: boolean;
}) {
	return function addSuffix(
		value: string | symbol | undefined,
		{
			isSimulatedLocally = false,
		}: {
			isSimulatedLocally?: boolean;
		} = {}
	) {
		const normalizedValue = normalizeValue(value);

		if (isProvisioning || !isLocalDev) {
			return normalizedValue;
		}

		return isSimulatedLocally
			? `${normalizedValue} [simulated locally]`
			: `${normalizedValue} [connected to remote resource]`;
	};
}
