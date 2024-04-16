// import OpenAI from 'openai';

export default {
	id: 'openai-auto-translate',
	handler: async ({ item_id, collection, language_table }, { env, services, getSchema }) => {
		const OpenAIService = require('openai');

		if(env.OPENAI_API_KEY == undefined) return "API Key not defined";
		if(env.OPENAI_RATE_LIMIT == undefined) return "API Key not defined";

		const openai = new OpenAIService({
			apiKey: env.OPENAI_API_KEY
		});

		const output = [];

		const { ItemsService } = services;
		const schema = await getSchema();
		const translations = await new ItemsService(`${collection}_translations`, { schema: schema });
		const languages = await new ItemsService(language_table, { schema: schema });
		//try {
			const mainDS = await translations.readByQuery({ fields: ['*'], filter: { [`${collection}_id`]: { _eq: item_id }}});
		// } catch (error) {
		// 	if (error.response) {
		// 		const response = JSON.parse(error.response);
		// 		const message = response?.data?.status?.description;
		// 		if (message) {
		// 			throw new Error(message);
		// 		}
		// 	}
		// 	throw new Error(error.message)
		// }
		if(!mainDS?.[0]) return 'No initial sample found.';

		const languageDS = await languages.readByQuery({ fields: ['code','name'], filter: { code: { _neq: mainDS[0].languages_code } } });
		//return {mainDS, languageDS};
		if(!languageDS?.[0]) return 'No initial translation found.';

		let translation_item = mainDS[0];
		delete translation_item['id'];
		const json_sample = translation_item;

		if(languageDS.length === 0) return 'No languages found in table.';
		for (let i = 0; i < languageDS.length; i++) {
			const foundData = await translations.readByQuery({ filter: { [`${collection}_id`]: { _eq: item_id }, languages_code: languageDS[i].code } });
			//return {foundData};
			output.push(await openapi_call(i, languageDS[i], json_sample, foundData?.[0]?.id));
		};

		await delay(languageDS.length * env.OPENAI_RATE_LIMIT);

		return {output};

		async function openapi_call(i, lang, json_sample, translationId){
			await delay(i * env.OPENAI_RATE_LIMIT);

			const openaiResponse = await openai.chat.completions.create({
				messages: [{ role: 'user', content: 'Translate the following JSON into '+lang.name+' '+JSON.stringify(json_sample) }],
				model: 'gpt-3.5-turbo',
			});

			if(openaiResponse == undefined) return {error: "No response from OpenAI"};

			let translated_data = JSON.parse(openaiResponse.choices[0].message.content.replace("\\\"","\""));
			translated_data.languages_code = lang.code;
			//console.log(translated_data);
			if(translationId) {
				return await translations.updateOne(translationId, translated_data);
			} else {
				return await translations.createOne(translated_data);
			}
		}

		function delay(ms) {
			return new Promise(resolve => setTimeout(resolve, ms));
		}


	},
};
